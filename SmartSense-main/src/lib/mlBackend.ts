// Shared client for the FastAPI ML backend, used by both the "Analyze Drive
// Vigilance" (Drowsiness page) and "Analyze Sleep" (Sleep/Recovery page) demo
// buttons. It's hosted on Render's free tier, which spins the service down
// after ~15 minutes idle — the first request after that wakes it back up,
// which can take 30-60s, and during that window requests fail at the network
// level (not a real "backend is down") rather than returning an HTTP error.
// This wraps that in a few retries with a growing delay so a cold start
// mostly resolves itself instead of surfacing as a hard failure.
export const ML_BACKEND_URL = "https://sih-2026-backend-bq02.onrender.com";

const WAKE_RETRY_DELAYS_MS = [4000, 8000, 15000];

export interface MlBackendCallOptions {
  /** Called before each retry, once a network-level failure suggests the
   * backend is asleep and waking up — lets the caller show a "waking up,
   * retrying…" status instead of a plain loading spinner. */
  onRetry?: (attempt: number, maxAttempts: number) => void;
}

export async function callMlBackend<T>(path: string, body: unknown, options: MlBackendCallOptions = {}): Promise<T> {
  const maxAttempts = WAKE_RETRY_DELAYS_MS.length + 1;
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const res = await fetch(`${ML_BACKEND_URL}${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        let detail = `Backend returned HTTP ${res.status}`;
        try {
          const errBody = await res.json();
          if (typeof errBody?.detail === "string") detail = errBody.detail;
          else if (errBody?.detail) detail = JSON.stringify(errBody.detail);
        } catch {
          // Response wasn't JSON — fall back to the HTTP status above.
        }
        throw new Error(detail);
      }
      return (await res.json()) as T;
    } catch (err) {
      lastError = err;
      // fetch() rejects with a TypeError specifically when the request never
      // reached a server (backend asleep/waking, wrong port, CORS blocked) —
      // an HTTP error means the backend is awake and responding, so retrying
      // that would just fail again the same way.
      const unreachable = err instanceof TypeError;
      if (!unreachable || attempt === maxAttempts) break;
      options.onRetry?.(attempt, maxAttempts);
      await new Promise((resolve) => setTimeout(resolve, WAKE_RETRY_DELAYS_MS[attempt - 1]));
    }
  }
  throw lastError;
}

export function mlBackendErrorMessage(err: unknown): string {
  const unreachable = err instanceof TypeError;
  return unreachable
    ? `Can't reach the ML backend at ${ML_BACKEND_URL} after a few attempts. It may just be slow to wake up from idle — wait a few seconds and try again.`
    : `Prediction failed: ${err instanceof Error ? err.message : String(err)}`;
}
