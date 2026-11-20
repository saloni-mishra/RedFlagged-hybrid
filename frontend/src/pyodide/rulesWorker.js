import knowledgeSource from "../../../backend/knowledge.py?raw";
import rulesSource from "../../../backend/rules.py?raw";
import dispatchSource from "./dispatch.py?raw";
import { PYODIDE_BASE_URL, PYODIDE_VERSION } from "./config.js";

const PYTHON_BOOTSTRAP = `
import sys
sys.path.insert(0, "/home/pyodide")
from dispatch import dispatch as _dispatch
`;

let pyodidePromise = null;
let dispatch = null;
let loadMs = null;

async function loadEngine() {
  const startedAt = performance.now();

  const { loadPyodide } = await import(
    /* @vite-ignore */ `${PYODIDE_BASE_URL}pyodide.mjs`
  );

  const pyodide = await loadPyodide({ indexURL: PYODIDE_BASE_URL });

  pyodide.FS.writeFile("/home/pyodide/rules.py", rulesSource);
  pyodide.FS.writeFile("/home/pyodide/knowledge.py", knowledgeSource);
  pyodide.FS.writeFile("/home/pyodide/dispatch.py", dispatchSource);

  pyodide.runPython(PYTHON_BOOTSTRAP);
  dispatch = pyodide.globals.get("_dispatch");

  return {
    pyodide,
    loadMs: performance.now() - startedAt,
    pythonVersion: pyodide.runPython("import sys; sys.version.split()[0]"),
  };
}

function ensureEngine() {
  if (!pyodidePromise) {
    pyodidePromise = loadEngine().catch((error) => {
      pyodidePromise = null;
      dispatch = null;
      throw error;
    });
  }
  return pyodidePromise;
}

self.addEventListener("message", async (event) => {
  const { id, type, text, lang } = event.data || {};
  if (type !== "analyze") return;

  try {
    if (!dispatch) {
      self.postMessage({ id, type: "status", state: "loading" });
    }

    const engine = await ensureEngine();
    loadMs = engine.loadMs;

    self.postMessage({
      id,
      type: "status",
      state: "analyzing",
      loadMs,
      pythonVersion: engine.pythonVersion,
    });

    const startedAt = performance.now();
    const resultJson = dispatch(
      JSON.stringify({ action: "analyze", text: text ?? "", lang }),
    );
    const analyzeMs = performance.now() - startedAt;

    self.postMessage({
      id,
      type: "result",
      resultJson,
      loadMs,
      analyzeMs,
      pythonVersion: engine.pythonVersion,
      pyodideVersion: PYODIDE_VERSION,
    });
  } catch (error) {
    self.postMessage({
      id,
      type: "error",
      message: error?.message || String(error),
      stack: error?.stack || "",
    });
  }
});
