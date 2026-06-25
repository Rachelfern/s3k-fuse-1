export function isNetworkFetchError(error: unknown): boolean {
  return error instanceof TypeError && error.message === "Failed to fetch";
}

type FetchJsonOptions = RequestInit & {
  retries?: number;
  retryDelayMs?: number;
};

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * fetch + JSON with a single retry on transient browser network errors
 * (common when Next.js dev recompiles an API route mid-request).
 */
export async function fetchJson<T>(
  input: RequestInfo | URL,
  options: FetchJsonOptions = {},
): Promise<T> {
  const { retries = 1, retryDelayMs = 600, ...init } = options;
  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const response = await fetch(input, init);

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(payload?.error ?? `Request failed (${response.status})`);
      }

      return (await response.json()) as T;
    } catch (error) {
      lastError = error;
      const shouldRetry = attempt < retries && isNetworkFetchError(error);
      if (!shouldRetry) break;
      await wait(retryDelayMs * (attempt + 1));
    }
  }

  throw lastError;
}
