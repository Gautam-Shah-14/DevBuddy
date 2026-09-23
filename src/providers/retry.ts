export interface RetryInfo {
  attempt: number; // the attempt that just failed (1-based)
  maxAttempts: number;
  delayMs: number;
  reason: string;
}

export interface RetryOptions {
  maxAttempts?: number; // total attempts including the first, default 3
  baseDelayMs?: number; // default 500
  maxDelayMs?: number; // cap on any single delay, default 8000
  onRetry?: (info: RetryInfo) => void;
}

const DEFAULTS: Required<Omit<RetryOptions, "onRetry">> = {
  maxAttempts: 3,
  baseDelayMs: 500,
  maxDelayMs: 8000,
};

function isRetryableStatus(status: number): boolean {
  return status === 429 || (status >= 500 && status <= 599);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Exponential backoff with up to 25% jitter, honoring a numeric-seconds Retry-After header when present. */
function computeDelay(attempt: number, baseDelayMs: number, maxDelayMs: number, retryAfterHeader: string | null): number {
  if (retryAfterHeader) {
    const seconds = Number(retryAfterHeader);
    if (Number.isFinite(seconds) && seconds >= 0) return Math.min(seconds * 1000, maxDelayMs);
  }
  const exponential = baseDelayMs * 2 ** (attempt - 1);
  const jitter = Math.random() * exponential * 0.25;
  return Math.min(exponential + jitter, maxDelayMs);
}

/**
 * Retries a fetch-returning function with exponential backoff, for
 * transient failures only: network errors and HTTP 429/5xx. A 4xx other
 * than 429 (bad API key, malformed request, not found) is never retried -
 * doing so just wastes time and delays the real error reaching the caller.
 *
 * This must only wrap the INITIAL request/response, never a response
 * already being streamed to the caller - once tokens have started
 * reaching a listener, retrying would duplicate output. Callers that
 * stream (the ChatProvider implementations) call this before reading the
 * response body, exactly where they already check `res.ok`.
 */
export async function fetchWithRetry(doFetch: () => Promise<Response>, options: RetryOptions = {}): Promise<Response> {
  const maxAttempts = options.maxAttempts ?? DEFAULTS.maxAttempts;
  const baseDelayMs = options.baseDelayMs ?? DEFAULTS.baseDelayMs;
  const maxDelayMs = options.maxDelayMs ?? DEFAULTS.maxDelayMs;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    let res: Response;
    try {
      res = await doFetch();
    } catch (err) {
      if (attempt === maxAttempts) throw err;
      const delay = computeDelay(attempt, baseDelayMs, maxDelayMs, null);
      options.onRetry?.({ attempt, maxAttempts, delayMs: delay, reason: (err as Error).message });
      await sleep(delay);
      continue;
    }

    if (res.ok || !isRetryableStatus(res.status) || attempt === maxAttempts) {
      return res;
    }

    const delay = computeDelay(attempt, baseDelayMs, maxDelayMs, res.headers.get("retry-after"));
    options.onRetry?.({ attempt, maxAttempts, delayMs: delay, reason: `HTTP ${res.status}` });
    await res.arrayBuffer().catch(() => {}); // drain the failed response's body before discarding it
    await sleep(delay);
  }

  /* istanbul ignore next - the loop above always returns or throws before falling through */
  throw new Error("fetchWithRetry: exhausted attempts without a result");
}
