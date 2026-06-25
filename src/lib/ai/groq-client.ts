import {
  getGroqApiKey,
  getGroqBaseUrl,
  getGroqModel,
  isGroqEnabled,
} from "@/lib/ai/groq-config";

export type GroqCallReason =
  | "Recommendation"
  | "Cart parsing"
  | "Intent detection"
  | "Conversational assistance"
  | "Reply draft";

export type GroqChatResult = {
  content: string;
  tokensUsed: number | null;
};

type GroqChatOptions = {
  system: string;
  user: string;
  jsonMode?: boolean;
  reason: GroqCallReason;
  message: string;
};

type GroqCompletionResponse = {
  choices?: { message?: { content?: string } }[];
  usage?: {
    total_tokens?: number;
    prompt_tokens?: number;
    completion_tokens?: number;
  };
};

const REQUEST_TIMEOUT_MS = 30_000;

export function logGroqCall(input: {
  reason: GroqCallReason;
  message: string;
  tokensUsed: number | null;
}): void {
  console.log("[GROQ] GROQ CALLED", {
    reason: input.reason,
    message: input.message,
    tokensUsed: input.tokensUsed,
  });
}

export async function groqChat(options: GroqChatOptions): Promise<GroqChatResult> {
  if (!isGroqEnabled()) {
    throw new Error("Groq is disabled (USE_GROQ=false)");
  }

  const apiKey = getGroqApiKey();
  if (!apiKey) {
    throw new Error("GROQ_API_KEY is not configured");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(`${getGroqBaseUrl()}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: getGroqModel(),
        messages: [
          { role: "system", content: options.system },
          { role: "user", content: options.user },
        ],
        ...(options.jsonMode ? { response_format: { type: "json_object" } } : {}),
        temperature: options.jsonMode ? 0.2 : 0.3,
        max_tokens: 400,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Groq request failed with status ${response.status}`);
    }

    const data = (await response.json()) as GroqCompletionResponse;
    const content = data.choices?.[0]?.message?.content?.trim();

    if (!content) {
      throw new Error("Groq returned an empty response");
    }

    const tokensUsed =
      data.usage?.total_tokens ??
      (data.usage?.prompt_tokens != null && data.usage?.completion_tokens != null
        ? data.usage.prompt_tokens + data.usage.completion_tokens
        : null);

    logGroqCall({
      reason: options.reason,
      message: options.message,
      tokensUsed,
    });

    return { content, tokensUsed };
  } finally {
    clearTimeout(timeout);
  }
}

export async function groqChatWithRetry(
  options: GroqChatOptions,
  retries = 1,
): Promise<GroqChatResult> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await groqChat(options);
    } catch (error) {
      lastError = error;
      if (attempt < retries) {
        console.warn("[GROQ] Request failed, retrying…", {
          reason: options.reason,
          attempt: attempt + 1,
        });
      }
    }
  }

  throw lastError;
}

export const GROQ_UNAVAILABLE_MESSAGE =
  "Sorry, recommendations are temporarily unavailable.";

export const GROQ_CONVERSATIONAL_FALLBACK =
  "Thanks for your message — I can help with products, recommendations, orders, or your cart.";

export const NO_MATCHING_PRODUCTS_MESSAGE =
  "I couldn't find matching products. Try another search.";
