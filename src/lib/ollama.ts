import { logOllamaExchange } from "@/lib/ai/ollama-debug";

const OLLAMA_BASE = process.env.NEXT_PUBLIC_OLLAMA_URL ?? "http://localhost:11434";
const MODEL = process.env.OLLAMA_MODEL ?? "qwen2.5:7b";

const SHOPPING_TEMPERATURE = 0.3;

export async function ollamaChat(
  system: string,
  user: string,
  jsonMode = false,
  debugLabel = "chat",
  retrievedContext?: string,
) {
  const res = await fetch(`${OLLAMA_BASE}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      stream: false,
      format: jsonMode ? "json" : undefined,
      options: {
        temperature: jsonMode ? 0.2 : SHOPPING_TEMPERATURE,
        num_predict: 400,
      },
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });
  if (!res.ok) throw new Error(`Ollama ${res.status}`);
  const data = await res.json();
  const content = data.message.content as string;

  logOllamaExchange({
    label: debugLabel,
    systemPrompt: system,
    userPrompt: user,
    retrievedContext,
    rawResponse: content,
  });

  return content;
}
