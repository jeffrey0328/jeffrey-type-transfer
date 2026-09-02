import test from "node:test";
import assert from "node:assert/strict";

import {
  extractChatText,
  extractResponsesText,
  parseAlignedTranslation,
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

test("keeps valid aligned segments", () => {
  const result = parseAlignedTranslation(
    JSON.stringify({
      detectedLanguage: "Chinese",
      translation: "Hello!",
      segments: [{ source: "你好！", target: "Hello!" }],
    }),
    "你好！",
    "test",
  );
  assert.equal(result.translation, "Hello!");
  assert.deepEqual(result.segments, [{ source: "你好！", target: "Hello!" }]);
});

test("falls back to one segment when provider alignment is invalid", () => {
  const result = parseAlignedTranslation(
    JSON.stringify({ translation: "Hello", segments: [{ source: "错", target: "Hello" }] }),
    "你好",
    "test",
  );
  assert.deepEqual(result.segments, [{ source: "你好", target: "Hello" }]);
});
