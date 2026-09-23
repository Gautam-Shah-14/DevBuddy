import { test } from "node:test";
import assert from "node:assert/strict";
import { fetchWithRetry, type RetryInfo } from "../src/providers/retry.js";

function jsonResponse(status: number, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify({}), { status, headers });
}

test("fetchWithRetry returns immediately on a successful first attempt", async () => {
  let calls = 0;
  const res = await fetchWithRetry(async () => {
    calls++;
    return jsonResponse(200);
  });
  assert.equal(res.status, 200);
  assert.equal(calls, 1);
});

test("fetchWithRetry does not retry a non-retryable 4xx status", async () => {
  let calls = 0;
  const events: RetryInfo[] = [];
  const res = await fetchWithRetry(
    async () => {
      calls++;
      return jsonResponse(401);
    },
    { onRetry: (e) => events.push(e) }
  );
  assert.equal(res.status, 401);
  assert.equal(calls, 1);
  assert.equal(events.length, 0);
});

test("fetchWithRetry retries a 500 and succeeds on the next attempt", async () => {
  let calls = 0;
  const events: RetryInfo[] = [];
  const res = await fetchWithRetry(
    async () => {
      calls++;
      return calls === 1 ? jsonResponse(500) : jsonResponse(200);
    },
    { baseDelayMs: 5, maxDelayMs: 20, onRetry: (e) => events.push(e) }
  );
  assert.equal(res.status, 200);
  assert.equal(calls, 2);
  assert.equal(events.length, 1);
  assert.equal(events[0].reason, "HTTP 500");
  assert.equal(events[0].attempt, 1);
  assert.equal(events[0].maxAttempts, 3);
});

test("fetchWithRetry retries 429 and gives up after maxAttempts, returning the last response", async () => {
  let calls = 0;
  const events: RetryInfo[] = [];
  const res = await fetchWithRetry(
    async () => {
      calls++;
      return jsonResponse(429);
    },
    { maxAttempts: 3, baseDelayMs: 5, maxDelayMs: 20, onRetry: (e) => events.push(e) }
  );
  assert.equal(res.status, 429);
  assert.equal(calls, 3);
  assert.equal(events.length, 2); // retried after attempt 1 and 2, gave up after attempt 3
});

test("fetchWithRetry honors a numeric Retry-After header", async () => {
  let calls = 0;
  const events: RetryInfo[] = [];
  const start = Date.now();
  await fetchWithRetry(
    async () => {
      calls++;
      return calls === 1 ? jsonResponse(429, { "retry-after": "0.05" }) : jsonResponse(200);
    },
    { baseDelayMs: 5000, maxDelayMs: 10000, onRetry: (e) => events.push(e) } // huge base delay - Retry-After should win instead
  );
  const elapsed = Date.now() - start;
  assert.equal(calls, 2);
  assert.equal(events[0].delayMs, 50);
  assert.ok(elapsed < 2000, `expected Retry-After (50ms) to override the 5000ms base delay, took ${elapsed}ms`);
});

test("fetchWithRetry retries a thrown network error and succeeds on the next attempt", async () => {
  let calls = 0;
  const events: RetryInfo[] = [];
  const res = await fetchWithRetry(
    async () => {
      calls++;
      if (calls === 1) throw new Error("ECONNRESET");
      return jsonResponse(200);
    },
    { baseDelayMs: 5, maxDelayMs: 20, onRetry: (e) => events.push(e) }
  );
  assert.equal(res.status, 200);
  assert.equal(calls, 2);
  assert.equal(events[0].reason, "ECONNRESET");
});

test("fetchWithRetry throws the last network error once attempts are exhausted", async () => {
  let calls = 0;
  await assert.rejects(
    () =>
      fetchWithRetry(
        async () => {
          calls++;
          throw new Error("network down");
        },
        { maxAttempts: 2, baseDelayMs: 5, maxDelayMs: 20 }
      ),
    /network down/
  );
  assert.equal(calls, 2);
});

test("fetchWithRetry never retries a plain 404", async () => {
  let calls = 0;
  const res = await fetchWithRetry(async () => {
    calls++;
    return jsonResponse(404);
  });
  assert.equal(res.status, 404);
  assert.equal(calls, 1);
});
