import {
  extractImageText as defaultExtractImageText,
  SUPPORTED_IMAGE_MIME_TYPES,
} from "./analysis/firebaseInference.js";

export function getImageMimeType(file) {
  const type = String(file?.type ?? "").toLowerCase();
  if (SUPPORTED_IMAGE_MIME_TYPES.includes(type)) return type;

  const name = String(file?.name ?? "").toLowerCase();
  if (name.endsWith(".png")) return "image/png";
  if (name.endsWith(".jpg") || name.endsWith(".jpeg")) return "image/jpeg";
  return "";
}

export function classifyUploadFile(file) {
  const type = String(file?.type ?? "").toLowerCase();
  const name = String(file?.name ?? "").toLowerCase();

  if (type === "application/pdf" || name.endsWith(".pdf")) return "pdf";
  if (getImageMimeType(file)) return "image";
  return "unsupported";
}

export async function extractPdfTextFromUpload(
  file,
  { apiBase, fetchImpl = globalThis.fetch } = {},
) {
  if (!apiBase) throw new Error("API base URL is missing.");
  if (typeof fetchImpl !== "function") throw new Error("Fetch is not available.");

  const formData = new FormData();
  formData.append("file", file);

  const response = await fetchImpl(`${apiBase}/api/extract-text`, {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    throw new Error(`PDF extraction failed (${response.status}).`);
  }

  const data = await response.json();

  return {
    text: data?.text || "",
    sourceType: "pdf",
    note: "PDF text was extracted on the server. PDF-derived text is analyzed in the cloud.",
  };
}

export async function extractImageTextFromUpload(
  file,
  { ai, extractImageTextFn = defaultExtractImageText } = {},
) {
  const mimeType = getImageMimeType(file);

  if (!mimeType) {
    throw new Error("Only JPEG and PNG images are supported.");
  }

  const result = await extractImageTextFn(ai, file, { mimeType });

  return {
    text: result?.text || "",
    sourceType: "text",
    note: "Image text was extracted in the cloud. Final analysis may run on-device or in the cloud.",
    extractionSource: result?.inferenceSource ?? null,
  };
}

export async function processUploadedFile(file, options = {}) {
  const kind = classifyUploadFile(file);

  if (kind === "pdf") {
    return extractPdfTextFromUpload(file, options);
  }

  if (kind === "image") {
    return extractImageTextFromUpload(file, options);
  }

  throw new Error("Please upload a PDF, JPEG, or PNG image.");
}
