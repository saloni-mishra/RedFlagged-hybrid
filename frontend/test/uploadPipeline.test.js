import test from "node:test";
import assert from "node:assert/strict";

import {
  classifyUploadFile,
  getImageMimeType,
  processUploadedFile,
} from "../src/uploadPipeline.js";

test("upload classification recognizes PDF, JPEG, and PNG", () => {
  assert.equal(
    classifyUploadFile({ name: "notice.PDF", type: "application/pdf" }),
    "pdf",
  );
  assert.equal(
    classifyUploadFile({ name: "notice.pdf", type: "" }),
    "pdf",
  );
  assert.equal(
    classifyUploadFile({ name: "photo.jpg", type: "image/jpeg" }),
    "image",
  );
  assert.equal(
    classifyUploadFile({ name: "photo.PNG", type: "" }),
    "image",
  );
  assert.equal(
    classifyUploadFile({ name: "animation.gif", type: "image/gif" }),
    "unsupported",
  );
  assert.equal(getImageMimeType({ name: "photo.jpeg", type: "" }), "image/jpeg");
});

test("PDF uploads use the FastAPI extraction endpoint and return sourceType pdf", async () => {
  const file = new File(["pdf bytes"], "notice.PDF", {
    type: "application/pdf",
  });
  const calls = [];

  const result = await processUploadedFile(file, {
    apiBase: "https://api.example",
    fetchImpl: async (url, init) => {
      calls.push({ url, init });
      return new Response(JSON.stringify({ text: "Extracted PDF text" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    },
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://api.example/api/extract-text");
  assert.equal(calls[0].init.method, "POST");
  assert.ok(calls[0].init.body instanceof FormData);
  assert.equal(result.text, "Extracted PDF text");
  assert.equal(result.sourceType, "pdf");
  assert.match(result.note, /server/);
  assert.match(result.note, /cloud/);
});

test("image uploads use cloud extraction and return plain text for hybrid analysis", async () => {
  const file = new File(["image bytes"], "photo.PNG", { type: "image/png" });
  let extractionCall = null;

  const result = await processUploadedFile(file, {
    ai: { name: "fake-ai" },
    extractImageTextFn: async (ai, uploadedFile, options) => {
      extractionCall = { ai, uploadedFile, options };
      return {
        text: "Extracted image text",
        inferenceSource: "in_cloud",
      };
    },
  });

  assert.equal(extractionCall.ai.name, "fake-ai");
  assert.equal(extractionCall.uploadedFile, file);
  assert.equal(extractionCall.options.mimeType, "image/png");
  assert.equal(result.text, "Extracted image text");
  assert.equal(result.sourceType, "text");
  assert.equal(result.extractionSource, "in_cloud");
  assert.match(result.note, /cloud/);
  assert.doesNotMatch(result.note, /on-device only/);
});

test("unsupported upload types are rejected", async () => {
  await assert.rejects(
    () =>
      processUploadedFile(
        new File(["gif"], "animation.gif", { type: "image/gif" }),
        {},
      ),
    /PDF, JPEG, or PNG/,
  );
});
