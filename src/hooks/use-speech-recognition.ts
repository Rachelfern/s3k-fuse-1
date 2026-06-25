"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type SpeechRecognitionState =
  | "idle"
  | "listening"
  | "processing"
  | "error";

export const SPEECH_ERROR_MESSAGE =
  "Could not recognize speech. Please try again.";

const LOG_PREFIX = "[SPEECH_RECOGNITION]";
const NETWORK_RETRY_DELAY_MS = 400;
const MAX_NETWORK_RETRIES = 1;

export function speechErrorMessageForCode(error: string): string {
  switch (error) {
    case "network":
      return "Speech recognition needs internet. Chrome sends audio to Google — check your connection, VPN, or ad blocker and try again.";
    case "not-allowed":
    case "service-not-allowed":
      return "Microphone access was blocked. Allow microphone permission for this site and try again.";
    case "no-speech":
      return "No speech detected. Tap the mic and speak clearly.";
    case "audio-capture":
      return "Could not access the microphone. Check that no other app is using it.";
    case "aborted":
      return SPEECH_ERROR_MESSAGE;
    default:
      return SPEECH_ERROR_MESSAGE;
  }
}

function speechLog(message: string, data?: unknown) {
  if (data !== undefined) {
    console.log(`${LOG_PREFIX} ${message}`, data);
    return;
  }
  console.log(`${LOG_PREFIX} ${message}`);
}

type SpeechRecognitionResultItem = {
  isFinal: boolean;
  0: { transcript: string; confidence?: number };
};

type SpeechRecognitionResultEvent = {
  resultIndex: number;
  results: {
    length: number;
    [index: number]: SpeechRecognitionResultItem;
  };
};

type SpeechRecognitionErrorEvent = {
  error: string;
  message?: string;
};

type SpeechRecognitionInstance = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onstart: ((ev: Event) => void) | null;
  onend: ((ev: Event) => void) | null;
  onerror: ((ev: SpeechRecognitionErrorEvent) => void) | null;
  onresult: ((ev: SpeechRecognitionResultEvent) => void) | null;
  onaudiostart: ((ev: Event) => void) | null;
  onaudioend: ((ev: Event) => void) | null;
  onsoundstart: ((ev: Event) => void) | null;
  onsoundend: ((ev: Event) => void) | null;
  onspeechstart: ((ev: Event) => void) | null;
  onspeechend: ((ev: Event) => void) | null;
  onnomatch: ((ev: Event) => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};

function getSpeechRecognitionCtor():
  | (new () => SpeechRecognitionInstance)
  | null {
  if (typeof window === "undefined") return null;

  const w = window as Window & {
    SpeechRecognition?: new () => SpeechRecognitionInstance;
    webkitSpeechRecognition?: new () => SpeechRecognitionInstance;
  };

  const ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
  speechLog("getSpeechRecognitionCtor", {
    hasSpeechRecognition: Boolean(w.SpeechRecognition),
    hasWebkitSpeechRecognition: Boolean(w.webkitSpeechRecognition),
    resolved: ctor ? "available" : "unavailable",
  });
  return ctor;
}

function serializeResults(event: SpeechRecognitionResultEvent) {
  const items: Array<{
    index: number;
    isFinal: boolean;
    transcript: string;
    confidence?: number;
  }> = [];

  for (let i = 0; i < event.results.length; i++) {
    const result = event.results[i];
    items.push({
      index: i,
      isFinal: result.isFinal,
      transcript: result[0]?.transcript ?? "",
      confidence: result[0]?.confidence,
    });
  }

  return {
    resultIndex: event.resultIndex,
    items,
  };
}

export function useSpeechRecognition() {
  const [state, setState] = useState<SpeechRecognitionState>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSupported, setIsSupported] = useState(false);

  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const transcriptRef = useRef("");
  const hadErrorRef = useRef(false);
  const cancelledRef = useRef(false);
  const networkRetryCountRef = useRef(0);
  const retryScheduledRef = useRef(false);
  const onResultRef = useRef<(text: string) => void>(() => {});

  useEffect(() => {
    const supported = getSpeechRecognitionCtor() !== null;
    setIsSupported(supported);
    speechLog("isSupported", supported);

    return () => {
      speechLog("cleanup: aborting active recognition");
      recognitionRef.current?.abort();
      recognitionRef.current = null;
    };
  }, []);

  const clearError = useCallback(() => {
    speechLog("clearError");
    setErrorMessage(null);
    hadErrorRef.current = false;
    setState((current) => (current === "error" ? "idle" : current));
  }, []);

  const cancelListening = useCallback(() => {
    speechLog("cancelListening");
    cancelledRef.current = true;
    networkRetryCountRef.current = 0;
    try {
      recognitionRef.current?.abort();
    } catch (error) {
      console.error(`${LOG_PREFIX} cancelListening abort() threw`, error);
      throw error;
    }
    recognitionRef.current = null;
    transcriptRef.current = "";
    setState("idle");
    setErrorMessage(null);
    hadErrorRef.current = false;
  }, []);

  const startListening = useCallback((
    onResult: (text: string) => void,
    options?: { isRetry?: boolean },
  ) => {
    speechLog("startListening called", { isRetry: Boolean(options?.isRetry) });

    if (!options?.isRetry) {
      networkRetryCountRef.current = 0;
    }

    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) {
      speechLog("startListening aborted: API not supported");
      return;
    }

    try {
      recognitionRef.current?.abort();
    } catch (error) {
      console.error(`${LOG_PREFIX} prior recognition.abort() threw`, error);
      throw error;
    }

    transcriptRef.current = "";
    hadErrorRef.current = false;
    cancelledRef.current = false;
    retryScheduledRef.current = false;
    onResultRef.current = onResult;
    setErrorMessage(null);

    const recognition = new Ctor();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = "en-IN";

    speechLog("recognition instance created", {
      continuous: recognition.continuous,
      interimResults: recognition.interimResults,
      lang: recognition.lang,
      networkRetryCount: networkRetryCountRef.current,
    });

    const scheduleNetworkRetry = () => {
      if (networkRetryCountRef.current >= MAX_NETWORK_RETRIES) {
        speechLog("network retry exhausted");
        return false;
      }

      networkRetryCountRef.current += 1;
      retryScheduledRef.current = true;
      speechLog("scheduling network retry", {
        attempt: networkRetryCountRef.current,
        delayMs: NETWORK_RETRY_DELAY_MS,
      });

      window.setTimeout(() => {
        if (cancelledRef.current) {
          speechLog("network retry skipped: cancelled");
          return;
        }
        startListening(onResultRef.current, { isRetry: true });
      }, NETWORK_RETRY_DELAY_MS);

      return true;
    };

    const failRecognition = (errorCode: string, context: string) => {
      speechLog(context, { errorCode });
      hadErrorRef.current = true;
      setState("error");
      setErrorMessage(speechErrorMessageForCode(errorCode));
    };

    recognition.onstart = (event) => {
      speechLog("onstart", event);
      setState("listening");
    };

    recognition.onaudiostart = (event) => {
      speechLog("onaudiostart", event);
    };

    recognition.onaudioend = (event) => {
      speechLog("onaudioend", event);
    };

    recognition.onsoundstart = (event) => {
      speechLog("onsoundstart", event);
    };

    recognition.onsoundend = (event) => {
      speechLog("onsoundend", event);
    };

    recognition.onspeechstart = (event) => {
      speechLog("onspeechstart", event);
    };

    recognition.onspeechend = (event) => {
      speechLog("onspeechend", event);
    };

    recognition.onnomatch = (event) => {
      speechLog("onnomatch", event);
    };

    recognition.onresult = (event) => {
      speechLog("onresult", serializeResults(event));

      let finalText = "";
      let interimText = "";

      for (let i = 0; i < event.results.length; i++) {
        const result = event.results[i];
        const transcript = result[0]?.transcript ?? "";
        if (result.isFinal) {
          finalText += transcript;
        } else {
          interimText += transcript;
        }
      }

      speechLog("onresult parsed", {
        finalText,
        interimText,
        transcriptRefBefore: transcriptRef.current,
      });

      if (finalText.trim()) {
        transcriptRef.current = finalText.trim();
      } else if (interimText.trim()) {
        transcriptRef.current = interimText.trim();
      }
    };

    recognition.onerror = (event) => {
      console.log("Speech error", event.error);
      speechLog("onerror", {
        error: event.error,
        message: event.message,
        cancelled: cancelledRef.current,
        hadTranscript: Boolean(transcriptRef.current.trim()),
      });

      if (event.error === "aborted") {
        speechLog("onerror ignored: aborted");
        return;
      }

      if (event.error === "network" && scheduleNetworkRetry()) {
        speechLog("onerror: network — retry scheduled");
        return;
      }

      networkRetryCountRef.current = 0;
      failRecognition(event.error, "onerror: terminal failure");
    };

    recognition.onend = (event) => {
      speechLog("onend", {
        event,
        cancelled: cancelledRef.current,
        hadError: hadErrorRef.current,
        transcriptRef: transcriptRef.current,
      });

      recognitionRef.current = null;

      if (cancelledRef.current) {
        speechLog("onend: user cancelled");
        cancelledRef.current = false;
        setState("idle");
        return;
      }

      if (hadErrorRef.current) {
        speechLog("onend: skipped because onerror already handled");
        return;
      }

      if (retryScheduledRef.current) {
        speechLog("onend: skipped because network retry is scheduled");
        retryScheduledRef.current = false;
        return;
      }

      const transcript = transcriptRef.current.trim();
      transcriptRef.current = "";

      if (transcript) {
        networkRetryCountRef.current = 0;
        speechLog("onend: transcript ready", transcript);
        setState("processing");
        window.setTimeout(() => {
          speechLog("onend: applying transcript to input", transcript);
          onResultRef.current(transcript);
          setState("idle");
        }, 150);
        return;
      }

      speechLog("onend: no transcript — showing error");
      networkRetryCountRef.current = 0;
      failRecognition("no-speech", "onend: no transcript");
    };

    recognitionRef.current = recognition;

    speechLog("recognition.start() calling");
    try {
      recognition.start();
      speechLog("recognition.start() returned without throwing");
    } catch (error) {
      console.error(`${LOG_PREFIX} recognition.start() threw`, error);
      networkRetryCountRef.current = 0;
      failRecognition("start-failed", "recognition.start() threw");
      throw error;
    }
  }, []);

  return {
    state,
    errorMessage,
    isSupported,
    startListening,
    cancelListening,
    clearError,
  };
}
