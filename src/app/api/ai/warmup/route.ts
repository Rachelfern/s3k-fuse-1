const WARMUP_TIMEOUT_MS = 3_000;

export async function GET() {
  const baseUrl =
    process.env.OLLAMA_BASE_URL?.replace(/\/$/, "") ?? "http://127.0.0.1:11434";
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), WARMUP_TIMEOUT_MS);

  try {
    const response = await fetch(`${baseUrl}/api/tags`, {
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Ollama unavailable (status ${response.status})`);
    }

    return Response.json({ ready: true });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Ollama warmup failed";
    return Response.json({ ready: false, error: message }, { status: 503 });
  } finally {
    clearTimeout(timeout);
  }
}
