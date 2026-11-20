import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { loadPyodide } from "pyodide";

import {
  PYODIDE_PYTHON_VERSION,
  PYODIDE_VERSION,
} from "../src/pyodide/config.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const frontendDir = path.resolve(here, "..");
const repoRoot = path.resolve(frontendDir, "..");
const backendDir = path.join(repoRoot, "backend");
const pythonCommand = process.env.PYTHON || "python";

const NATIVE_SCRIPT = String.raw`
import ast
import json

from knowledge import retrieve_context
from rules import analyze_rules

with open("t.py", encoding="utf-8") as handle:
    tree = ast.parse(handle.read())

tests = None
for node in tree.body:
    if isinstance(node, ast.Assign):
        for target in node.targets:
            if isinstance(target, ast.Name) and target.id == "tests":
                tests = ast.literal_eval(node.value)

if tests is None:
    raise SystemExit("tests list not found in t.py")

rows = []
for name, text, expected in tests:
    rows.append({
        "name": name,
        "text": text,
        "expected": expected,
        "result": analyze_rules(text),
    })

print(json.dumps({
    "tests": rows,
    "knowledge_query": "bank otp kyc",
    "knowledge": retrieve_context("bank otp kyc"),
}, ensure_ascii=True))
`;

const BOOTSTRAP = String.raw`
import sys
sys.path.insert(0, "/home/pyodide")
from dispatch import dispatch as _dispatch
`;

function expectedLevelPass(expected, level) {
  if (!expected.endsWith("+")) return expected === level;

  const ranks = { LOW: 0, MED: 1, MEDIUM: 1, HIGH: 2 };
  const base = expected.slice(0, -1);
  return ranks[level] >= ranks[base];
}

function stableJson(value) {
  return JSON.stringify(value);
}

function runNativeSamples() {
  const native = spawnSync(pythonCommand, ["-B", "-c", NATIVE_SCRIPT], {
    cwd: backendDir,
    encoding: "utf8",
    env: { ...process.env, PYTHONIOENCODING: "utf-8" },
    maxBuffer: 32 * 1024 * 1024,
  });

  if (native.error) {
    throw new Error(
      `Could not start native Python (${pythonCommand}): ${native.error.message}`,
    );
  }

  if (native.status !== 0) {
    throw new Error(
      `Native Python failed:\n${native.stderr || native.stdout || "unknown error"}`,
    );
  }

  return JSON.parse(native.stdout.trim());
}

async function runPyodideSamples(rows, knowledgeQuery) {
  const startedAt = performance.now();
  const pyodide = await loadPyodide();

  pyodide.FS.writeFile(
    "/home/pyodide/rules.py",
    readFileSync(path.join(backendDir, "rules.py"), "utf8"),
  );
  pyodide.FS.writeFile(
    "/home/pyodide/knowledge.py",
    readFileSync(path.join(backendDir, "knowledge.py"), "utf8"),
  );
  pyodide.FS.writeFile(
    "/home/pyodide/dispatch.py",
    readFileSync(path.join(frontendDir, "src", "pyodide", "dispatch.py"), "utf8"),
  );

  pyodide.runPython(BOOTSTRAP);
  const dispatch = pyodide.globals.get("_dispatch");
  const loadMs = performance.now() - startedAt;
  const pythonVersion = pyodide.runPython("import sys; sys.version.split()[0]");

  const analysisStartedAt = performance.now();
  const results = rows.map((row) =>
    JSON.parse(
      dispatch(
        JSON.stringify({ action: "analyze", text: row.text }),
      ),
    ),
  );
  const analysisMs = performance.now() - analysisStartedAt;

  const knowledge = JSON.parse(
    dispatch(
      JSON.stringify({ action: "retrieve_context", text: knowledgeQuery }),
    ),
  ).context;

  dispatch.destroy?.();

  return { results, knowledge, loadMs, analysisMs, pythonVersion };
}

const nativePayload = runNativeSamples();
const rows = nativePayload.tests;
const pyodideRun = await runPyodideSamples(
  rows,
  nativePayload.knowledge_query,
);
const knowledgeMatches = nativePayload.knowledge === pyodideRun.knowledge;

let coreMatches = 0;
let fullMatches = 0;
let expectedMatches = 0;
const failures = [];

rows.forEach((row, index) => {
  const native = row.result;
  const browser = pyodideRun.results[index];

  const coreSame =
    native.rule_score === browser.rule_score &&
    native.risk_level === browser.risk_level &&
    stableJson(native.flags) === stableJson(browser.flags);
  const fullSame = stableJson(native) === stableJson(browser);
  const expectedSame = expectedLevelPass(row.expected, browser.risk_level);

  if (coreSame) coreMatches += 1;
  if (fullSame) fullMatches += 1;
  if (expectedSame) expectedMatches += 1;

  if (!coreSame || !fullSame || !expectedSame) {
    failures.push({
      name: row.name,
      expected: row.expected,
      native: {
        rule_score: native.rule_score,
        risk_level: native.risk_level,
        flags: native.flags,
      },
      pyodide: {
        rule_score: browser.rule_score,
        risk_level: browser.risk_level,
        flags: browser.flags,
      },
      coreSame,
      fullSame,
      expectedSame,
    });
  }
});

console.log(
  `Pyodide: ${PYODIDE_VERSION} (Python ${pyodideRun.pythonVersion}; expected ${PYODIDE_PYTHON_VERSION})`,
);
console.log(`Samples: ${rows.length}`);
console.log(`Score/level/flags parity: ${coreMatches}/${rows.length}`);
console.log(`Full result parity: ${fullMatches}/${rows.length}`);
console.log(`Expected-level checks: ${expectedMatches}/${rows.length}`);
console.log(`Knowledge retrieval parity: ${knowledgeMatches ? "match" : "MISMATCH"}`);
console.log(
  `Pyodide load + module import: ${Math.round(pyodideRun.loadMs)} ms`,
);
console.log(
  `All analyses inside Pyodide: ${pyodideRun.analysisMs.toFixed(1)} ms ` +
    `(${(pyodideRun.analysisMs / rows.length).toFixed(1)} ms average)`,
);

if (failures.length > 0 || !knowledgeMatches) {
  if (failures.length > 0) {
    console.error("\nMismatches:");
    for (const failure of failures) {
      console.error(JSON.stringify(failure, null, 2));
    }
  }
  if (!knowledgeMatches) {
    console.error("\nKnowledge retrieval output differs between native Python and Pyodide.");
    console.error("Native:", JSON.stringify(nativePayload.knowledge));
    console.error("Pyodide:", JSON.stringify(pyodideRun.knowledge));
  }
  process.exitCode = 1;
} else {
  console.log("\nAll native/Pyodide parity checks passed.");
}
