const TRUTHY = new Set(["true", "1", "yes"]);

export function isGroqEnabled(): boolean {
  return TRUTHY.has((process.env.USE_GROQ ?? "").toLowerCase());
}

export function getGroqApiKey(): string | undefined {
  return process.env.GROQ_API_KEY;
}

export function getGroqModel(): string {
  return process.env.GROQ_MODEL ?? "llama-3.3-70b-versatile";
}

export function getGroqBaseUrl(): string {
  return (process.env.GROQ_BASE_URL ?? "https://api.groq.com/openai/v1").replace(
    /\/$/,
    "",
  );
}
