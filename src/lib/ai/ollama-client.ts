import { logOllamaExchange } from "@/lib/ai/ollama-debug";

export const OLLAMA_MODEL = "qwen2.5:7b";

const DEFAULT_BASE_URL = "http://127.0.0.1:11434";
const DEFAULT_MODEL = OLLAMA_MODEL;
const REQUEST_TIMEOUT_MS = 30_000;

function getOllamaConfig() {
  return {
    baseUrl: process.env.OLLAMA_BASE_URL?.replace(/\/$/, "") ?? DEFAULT_BASE_URL,
    model: process.env.OLLAMA_MODEL ?? DEFAULT_MODEL,
  };
}

interface OllamaChatResponse {
  message?: {
    content?: string;
  };
}

async function callOllamaChat(
  prompt: string,
  options?: { format?: "json"; label?: string },
): Promise<string> {
  const { baseUrl, model } = getOllamaConfig();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(`${baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        stream: false,
        ...(options?.format ? { format: options.format } : {}),
        options: {
          temperature: options?.format ? 0.2 : 0.3,
          num_predict: 400,
        },
        messages: [{ role: "user", content: prompt }],
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Ollama request failed with status ${response.status}`);
    }

    const data = (await response.json()) as OllamaChatResponse;
    const content = data.message?.content?.trim();

    if (!content) {
      throw new Error("Ollama returned an empty response");
    }

    logOllamaExchange({
      label: options?.label ?? "commerce-agent",
      systemPrompt: "(embedded in user prompt)",
      userPrompt: prompt,
      rawResponse: content,
    });

    return content;
  } finally {
    clearTimeout(timeout);
  }
}

export async function generateOllamaJson(prompt: string): Promise<string> {
  return callOllamaChat(prompt, { format: "json", label: "commerce-agent-json" });
}

export async function generateOllamaText(prompt: string): Promise<string> {
  return callOllamaChat(prompt);
}
