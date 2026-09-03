import test from "node:test";
import assert from "node:assert/strict";

import {
  checkApiConnection,
  extractChatText,
  extractResponsesText,
  parseTranslation,
} from "../translate.js";

test("extracts Responses API output text", () => {
  assert.equal(extractResponsesText({ output_text: "hello" }), "hello");
  assert.equal(
    extractResponsesText({ output: [{ content: [{ type: "output_text", text: "world" }] }] }),
    "world",
  );
});

test("extracts Chat Completions content", () => {
  assert.equal(extractChatText({ choices: [{ message: { content: "translated" } }] }), "translated");
});

test("extracts a structured translation", () => {
  assert.deepEqual(
    parseTranslation(JSON.stringify({ translation: "Hello!" }), "test"),
    { translation: "Hello!", provider: "test" },
  );
});

test("accepts plain text from compatible providers", () => {
  assert.deepEqual(
    parseTranslation("Hello", "test"),
    { translation: "Hello", provider: "test" },
  );
});

test("checks the configured API model without sending translation text", async (context) => {
  context.mock.method(globalThis, "fetch", async (url, options) => {
    assert.equal(url, "https://example.test/v1/models/demo-model");
    assert.equal(options.headers.Authorization, "Bearer secret");
    assert.equal(options.method, undefined);
    return new Response("{}", { status: 200 });
  });
  assert.deepEqual(
    await checkApiConnection({
      apiBaseUrl: "https://example.test/v1/",
      apiModel: "demo-model",
      apiKey: "secret",
    }),
    { ok: true, statusMessage: "API 已连接 · demo-model" },
  );
});

test("keeps the settings gate closed when the API check fails", async (context) => {
  context.mock.method(globalThis, "fetch", async () =>
    new Response('{"error":"invalid credentials"}', { status: 401 }),
  );
  await assert.rejects(
    checkApiConnection({
      apiBaseUrl: "https://example.test/v1",
      apiModel: "demo-model",
      apiKey: "invalid",
    }),
    /API 连接检测失败 \(401\)/,
  );
});
