/**
 * Python's repr() uses single quotes for ordinary strings and keeps printable
 * Unicode characters visible. The backend prompt interpolates the flags list
 * directly, so this keeps the JavaScript prompt close to the Python output.
 */
function pythonStringRepr(value) {
  const text = String(value);
  const quote = text.includes("'") && !text.includes('"') ? '"' : "'";

  let output = quote;
  for (const character of text) {
    if (character === "\\") output += "\\\\";
    else if (character === quote) output += `\\${character}`;
    else if (character === "\n") output += "\\n";
    else if (character === "\r") output += "\\r";
    else if (character === "\t") output += "\\t";
    else output += character;
  }
  return output + quote;
}

function pythonListRepr(values) {
  if (!Array.isArray(values)) return "[]";
  return `[${values.map(pythonStringRepr).join(", ")}]`;
}

export function linkAssessment(ruleResults) {
  for (const item of ruleResults?.rule_breakdown ?? []) {
    const classification = item?.classification ?? "";
    if (classification) {
      return [classification, item?.explanation ?? ""];
    }
  }
  return ["", ""];
}

export function buildPrompt(text, ruleResults, knowledge, language) {
  const languageInstruction =
    language === "hi"
      ? "Write every user-facing field in Hindi using Devanagari script (for example: " +
        "summary, red_flags[].indicator, red_flags[].explanation, safe_next_steps, " +
        "verification_guidance, disclaimer, and any verdict text). Keep JSON keys, " +
        "risk-level enum values (LOW/MEDIUM/HIGH), and URLs in English."
      : "Write every user-facing field in English. Keep JSON keys, risk-level " +
        "enum values (LOW/MEDIUM/HIGH), and URLs in English.";

  const [linkClassification, linkExplanation] = linkAssessment(ruleResults);

  return `
Analyze the following notice for indicators of scam,
impersonation, or coercive patterns.

IMPORTANT INTERPRETATION GUIDANCE:
Do not treat widely-known, reputable domains (e.g. google.com, github.com,
microsoft.com, amazon.com, apple.com) as inherently suspicious or as signs
of impersonation just because they are mentioned. Only flag a domain as
suspicious if there is a concrete reason in the message itself — such as a
misspelled/lookalike domain, a URL shortener, or the domain being paired
with a request for payment, OTP, or login credentials. If a message
explicitly states there is no urgency or no payment required, do not
describe this as a "contradiction" unless the deterministic rule checks
also independently confirm urgency or payment indicators are present.

URL ASSESSMENT GUIDANCE:
The deterministic URL assessment is one of "suspicious" (deceptive
indicators found), "unverified" (an external URL is present but no
deceptive indicators were found), or "none" (no external URL). An
"unverified" verdict is not a finding of maliciousness: if a URL is
merely "unverified", do not claim the deterministic checks established
that it is malicious or a confirmed phishing link. The surrounding
message can still be suspicious because of impersonation, urgency,
credential requests, or other evidence — assess those on their own
merits. Explain uncertainty accurately and recommend independent
verification when appropriate. Conversely, never present the absence of
deceptive indicators, or the mention of a widely-known domain, as proof
that a URL is safe.

LANGUAGE INSTRUCTION:
${languageInstruction}

MESSAGE CONTENT:
${text}

DETERMINISTIC CHECKS:

- Rule Score: ${ruleResults.rule_score}
- Risk Level: ${ruleResults.risk_level}
- Identified Flags: ${pythonListRepr(ruleResults.flags)}
- Detected Language: ${language}
- URL Assessment: ${linkClassification} — ${linkExplanation}

VERIFIED KNOWLEDGE & INSTITUTIONAL STANDARDS:
${knowledge ?? ""}

Provide an objective, non-accusatory assessment emphasizing
verification procedures.

Return the result using the required JSON schema.
`;
}
