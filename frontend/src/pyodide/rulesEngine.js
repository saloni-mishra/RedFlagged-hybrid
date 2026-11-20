let worker = null;
let nextRequestId = 1;
const pending = new Map();
let lastMeta = null;

function notifyStatus(entry, status) {
  try {
    entry.onStatus?.(status);
  } catch (error) {
    console.error("rulesEngine status callback failed", error);
  }
}

function rejectAll(error) {
  for (const entry of pending.values()) {
    notifyStatus(entry, { state: "error", message: error.message });
    entry.reject(error);
  }
  pending.clear();
}

function handleMessage(event) {
  const message = event.data || {};
  const entry = pending.get(message.id);
  if (!entry) return;

  if (message.type === "status") {
    notifyStatus(entry, {
      state: message.state,
      loadMs: message.loadMs,
      pythonVersion: message.pythonVersion,
    });
    return;
  }

  pending.delete(message.id);

  if (message.type === "error") {
    const error = new Error(message.message || "Rule engine failed");
    error.stack = message.stack || error.stack;
    notifyStatus(entry, { state: "error", message: error.message });
    entry.reject(error);
    return;
  }

  if (message.type === "result") {
    lastMeta = {
      loadMs: message.loadMs,
      analyzeMs: message.analyzeMs,
      pythonVersion: message.pythonVersion,
      pyodideVersion: message.pyodideVersion,
    };
    notifyStatus(entry, { state: "done", ...lastMeta });

    try {
      entry.resolve(JSON.parse(message.resultJson));
    } catch (error) {
      entry.reject(new Error(`Could not parse rule engine result: ${error.message}`));
    }
  }
}

function getWorker() {
  if (worker) return worker;

  worker = new Worker(new URL("./rulesWorker.js", import.meta.url), {
    type: "module",
  });

  worker.addEventListener("message", handleMessage);
  worker.addEventListener("error", (event) => {
    const error = new Error(event.message || "Rule engine worker failed");
    rejectAll(error);
    worker?.terminate();
    worker = null;
  });
  worker.addEventListener("messageerror", () => {
    const error = new Error("Rule engine worker sent an unreadable message");
    rejectAll(error);
    worker?.terminate();
    worker = null;
  });

  return worker;
}

/**
 * Run the unchanged Python rule engine in a Web Worker.
 *
 * @param {string} text Notice text.
 * @param {{ lang?: "en" | "hi", onStatus?: (status: object) => void }} [options]
 * @returns {Promise<Record<string, unknown>>} Same dictionary as analyze_rules().
 */
export function analyzeRules(text, options = {}) {
  const { lang, onStatus } = options;

  return new Promise((resolve, reject) => {
    const id = nextRequestId++;
    pending.set(id, { resolve, reject, onStatus });
    getWorker().postMessage({ id, type: "analyze", text, lang });
  });
}

/** Metadata from the most recent successful analysis. */
export function getRulesEngineMeta() {
  return lastMeta ? { ...lastMeta } : null;
}
