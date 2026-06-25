export const OLLAMA_DEBUG_ENABLED =
  process.env.OLLAMA_DEBUG === "true" || process.env.NODE_ENV !== "production";

export function logOllamaExchange(input: {
  label: string;
  systemPrompt: string;
  userPrompt: string;
  rawResponse?: string;
  retrievedContext?: string;
}): void {
  if (!OLLAMA_DEBUG_ENABLED) return;

  console.log(`[OLLAMA_DEBUG] ${input.label}`, {
    systemPrompt: input.systemPrompt,
    userPrompt: input.userPrompt,
    retrievedContext: input.retrievedContext,
    rawResponse: input.rawResponse,
  });
}
