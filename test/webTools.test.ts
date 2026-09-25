import { test } from "node:test";
import assert from "node:assert/strict";
import { webSearchTool, parseDuckDuckGoResults, formatSearchResults } from "../src/tools/webTools.js";
import { setAutoApprove, PermissionDenied } from "../src/lib/permissions.js";

// A trimmed fixture shaped like DuckDuckGo's no-JS html.duckduckgo.com results page.
const FIXTURE_HTML = `
<div class="results">
  <div class="result results_links results_links_deep web-result">
    <div class="links_main links_deep result__body">
      <h2 class="result__title">
        <a rel="nofollow" class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fnodejs.org%2Fapi%2Ffs.html&amp;rut=abc">
          Node.js File System &amp; docs
        </a>
      </h2>
      <a class="result__snippet" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fnodejs.org%2Fapi%2Ffs.html">
        The <b>fs</b> module enables interacting with the file system.
      </a>
    </div>
  </div>
  <div class="result results_links results_links_deep web-result">
    <div class="links_main links_deep result__body">
      <h2 class="result__title">
        <a rel="nofollow" class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com%2Fsecond">
          Second Result
        </a>
      </h2>
      <a class="result__snippet" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com%2Fsecond">
        A second, unrelated snippet.
      </a>
    </div>
  </div>
</div>
`;

test("parseDuckDuckGoResults extracts title, resolved URL, and snippet from the redirect-wrapped HTML", () => {
  const results = parseDuckDuckGoResults(FIXTURE_HTML);
  assert.equal(results.length, 2);
  assert.equal(results[0].title, "Node.js File System & docs");
  assert.equal(results[0].url, "https://nodejs.org/api/fs.html");
  assert.match(results[0].snippet, /fs module enables interacting/);
  assert.equal(results[1].url, "https://example.com/second");
});

test("parseDuckDuckGoResults returns an empty array for HTML with no results", () => {
  assert.deepEqual(parseDuckDuckGoResults("<div class=\"no-results\">Nothing found</div>"), []);
});

test("formatSearchResults renders a numbered list, and '(no results)' when empty", () => {
  const results = parseDuckDuckGoResults(FIXTURE_HTML);
  const formatted = formatSearchResults(results);
  assert.match(formatted, /^1\. Node\.js File System & docs/);
  assert.match(formatted, /2\. Second Result/);
  assert.equal(formatSearchResults([]), "(no results)");
});

test("web_search tool fetches DuckDuckGo, requires permission, and returns formatted results", async (t) => {
  const originalFetch = globalThis.fetch;
  let requestedUrl = "";
  globalThis.fetch = (async (url: string | URL) => {
    requestedUrl = url.toString();
    return new Response(FIXTURE_HTML, { status: 200 });
  }) as typeof fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
    setAutoApprove(false);
  });

  setAutoApprove(true);
  const result = await webSearchTool.execute({ query: "node fs module" }, undefined as never);

  assert.ok(requestedUrl.includes("html.duckduckgo.com/html/"));
  assert.ok(requestedUrl.includes(encodeURIComponent("node fs module")));
  assert.match(result, /Node\.js File System/);
});

test("web_search refuses to run in a non-interactive session without auto-approve", async () => {
  await assert.rejects(
    webSearchTool.execute({ query: "anything" }, undefined as never),
    PermissionDenied
  );
});

test("web_search surfaces a clear error when the HTTP request fails", async (t) => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response("", { status: 503 })) as typeof fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
    setAutoApprove(false);
  });

  setAutoApprove(true);
  const result = await webSearchTool.execute({ query: "anything" }, undefined as never);
  assert.match(result, /HTTP 503/);
});
