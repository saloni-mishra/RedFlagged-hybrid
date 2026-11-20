import { analyzeRules } from "./pyodide/rulesEngine.js";

const textInput = document.getElementById("text");
const runButton = document.getElementById("run");
const status = document.getElementById("status");
const summary = document.getElementById("summary");
const out = document.getElementById("out");

function showStatus(event) {
  if (event.state === "loading") {
    status.textContent = "Loading Pyodide and the rule engine…";
    return;
  }

  if (event.state === "analyzing") {
    status.textContent = `Engine loaded in ${Math.round(event.loadMs)} ms (Python ${event.pythonVersion}). Analyzing…`;
    return;
  }

  if (event.state === "done") {
    status.textContent = `Done. Engine load: ${Math.round(event.loadMs)} ms. Analysis: ${event.analyzeMs.toFixed(1)} ms. Python ${event.pythonVersion}, Pyodide ${event.pyodideVersion}.`;
    return;
  }

  if (event.state === "error") {
    status.textContent = `Error: ${event.message}`;
  }
}

runButton.addEventListener("click", async () => {
  runButton.disabled = true;
  summary.textContent = "";
  out.textContent = "";

  try {
    const result = await analyzeRules(textInput.value, { onStatus: showStatus });

    summary.textContent =
      `Score: ${result.rule_score} / 100\n` +
      `Risk level: ${result.risk_level}\n` +
      `Language: ${result.language}\n` +
      `Flags: ${result.flags.length ? result.flags.join(" | ") : "none"}`;

    out.textContent = JSON.stringify(result, null, 2);
  } catch (error) {
    status.textContent = `Error: ${error.message}`;
    console.error(error);
  } finally {
    runButton.disabled = false;
  }
});

if (new URLSearchParams(window.location.search).has("auto")) {
  runButton.click();
}

