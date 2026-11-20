import test from "node:test";
import assert from "node:assert/strict";

import {
  buildAnalysisResponse,
  buildPrompt,
  FALLBACK_TEXT,
  fallbackResponse,
  KNOWLEDGE_BASE,
  linkAssessment,
  NOTICE_ANALYSIS_REQUIRED_FIELDS,
  RED_FLAG_REQUIRED_FIELDS,
  retrieveContext,
  ruleRows,
  RULE_BREAKDOWN_REQUIRED_FIELDS,
} from "../src/analysis/index.js";

const TEXT =
  "URGENT: This is the Income Tax Department. Your PAN will be suspended " +
  "today unless you verify your details immediately at " +
  "https://example.com/verify.";

const LINK_EXPLANATION =
  "Unverified external link present but no deceptive indicators found: " +
  "https://example.com/verify. Verify independently before clicking or paying.";

function makeRuleBreakdown() {
  return [
    {
      rule: "Urgent deadline or coercion",
      rule_hi: "तुरंत कार्रवाई का दबाव या धमकी",
      points: 35,
      triggered: true,
      evidence: "immediately, URGENT",
      explanation: "Coercive urgency or deadline indicators detected.",
    },
    {
      rule: "Financial demand or digital payment",
      rule_hi: "पैसे की मांग या डिजिटल भुगतान",
      points: 0,
      triggered: false,
      evidence: "",
      explanation: "No matching financial demand or payment indicator found.",
    },
    {
      rule: "Suspicious external link",
      rule_hi: "संदिग्ध बाहरी लिंक",
      points: 0,
      triggered: false,
      evidence: "",
      explanation: LINK_EXPLANATION,
      classification: "unverified",
    },
    {
      rule: "OTP, Aadhaar, or credential request",
      rule_hi: "OTP, आधार या पासवर्ड की मांग",
      points: 0,
      triggered: false,
      evidence: "",
      explanation: "No matching credential-harvesting language found.",
    },
    {
      rule: "Courier or customs hold scam",
      rule_hi: "कूरियर या कस्टम होल्ड स्कैम",
      points: 0,
      triggered: false,
      evidence: "",
      explanation: "No courier or customs clearance patterns found.",
    },
    {
      rule: "Job or recruitment scam lure",
      rule_hi: "नौकरी या भर्ती स्कैम का लालच",
      points: 0,
      triggered: false,
      evidence: "",
      explanation: "No matching job recruitment or prize-lure patterns found.",
    },
  ];
}

function makeRuleResults(overrides = {}) {
  return {
    // analyze_rules() returns "rule_score", not calculated_score.
    rule_score: 60,
    raw_points: 35,
    risk_level: "MEDIUM",
    flags: ["High-pressure urgency or legal intimidation detected."],
    extracted_urls: ["https://example.com/verify"],
    unverified_urls: ["https://example.com/verify"],
    amounts: [],
    payment_handles: [],
    urgency_phrases: ["immediately", "URGENT"],
    rule_breakdown: makeRuleBreakdown(),
    language: "en",
    ...overrides,
  };
}

test("English prompt generation", () => {
  const rules = makeRuleResults();
  const prompt = buildPrompt(TEXT, rules, "TEST KNOWLEDGE", "en");

  assert.match(prompt, /Analyze the following notice/);
  assert.ok(prompt.includes("Write every user-facing field in English."));
  assert.ok(prompt.includes("Keep JSON keys, risk-level enum values (LOW/MEDIUM/HIGH)"));
  assert.ok(prompt.includes(TEXT));
  assert.ok(prompt.includes("- Rule Score: 60"));
  assert.ok(prompt.includes("- Risk Level: MEDIUM"));
  assert.ok(
    prompt.includes(
      "- Identified Flags: ['High-pressure urgency or legal intimidation detected.']",
    ),
  );
  assert.ok(prompt.includes("- Detected Language: en"));
  assert.ok(prompt.includes(`- URL Assessment: unverified — ${LINK_EXPLANATION}`));
  assert.ok(prompt.includes("TEST KNOWLEDGE"));
  assert.ok(prompt.includes("Return the result using the required JSON schema."));
  assert.ok(prompt.includes('"unverified" verdict is not a finding of maliciousness'));
});

test("Hindi prompt generation", () => {
  const rules = makeRuleResults({ language: "hi" });
  const prompt = buildPrompt(TEXT, rules, "ज्ञान", "hi");

  assert.ok(
    prompt.includes(
      "Write every user-facing field in Hindi using Devanagari script",
    ),
  );
  assert.ok(prompt.includes("Keep JSON keys, risk-level enum values (LOW/MEDIUM/HIGH)"));
  assert.ok(prompt.includes("- Detected Language: hi"));
  assert.ok(prompt.includes("ज्ञान"));
  assert.ok(prompt.includes(TEXT));
});

test("knowledge retrieval matches the Python keyword groups", () => {
  assert.ok(
    retrieveContext("This is about a tax refund").includes(
      KNOWLEDGE_BASE.government_tax,
    ),
  );
  assert.ok(
    retrieveContext("The police sent an arrest warrant").includes(
      KNOWLEDGE_BASE.law_enforcement,
    ),
  );
  assert.ok(
    retrieveContext("Your bank KYC and OTP").includes(KNOWLEDGE_BASE.banking),
  );

  const combined = retrieveContext("Tax office and police arrest");
  assert.ok(combined.includes(KNOWLEDGE_BASE.government_tax));
  assert.ok(combined.includes(KNOWLEDGE_BASE.law_enforcement));
  assert.ok(combined.includes("\n\n"));

  assert.equal(
    retrieveContext("Lunch at 2 tomorrow?"),
    "Standard caution applies: Verify sender identities via independent official public contact channels.",
  );
});

test("URL assessment returns the first classified rule row", () => {
  const rules = makeRuleResults();
  assert.deepEqual(linkAssessment(rules), ["unverified", LINK_EXPLANATION]);

  const suspiciousRules = makeRuleResults({
    rule_breakdown: makeRuleBreakdown().map((row) =>
      row.classification
        ? {
            ...row,
            classification: "suspicious",
            explanation: "Deceptive URL indicator detected.",
          }
        : row,
    ),
  });
  assert.deepEqual(linkAssessment(suspiciousRules), [
    "suspicious",
    "Deceptive URL indicator detected.",
  ]);

  const noneRules = makeRuleResults({
    rule_breakdown: makeRuleBreakdown().map((row) =>
      row.classification ? { ...row, classification: "none" } : row,
    ),
  });
  assert.deepEqual(linkAssessment(noneRules), ["none", LINK_EXPLANATION]);

  assert.deepEqual(
    linkAssessment({
      rule_breakdown: makeRuleBreakdown().map((row) => {
        const copy = { ...row };
        delete copy.classification;
        return copy;
      }),
    }),
    ["", ""],
  );
});

test("normal response construction keeps rule score and risk level", () => {
  const rules = makeRuleResults();
  const aiResult = {
    situation_type: "Likely government impersonation",
    // These must be ignored in favour of the rule engine.
    risk_level: "LOW",
    calculated_score: 1,
    summary: "AI summary",
    red_flags: [
      {
        indicator: "Urgency",
        evidence: "URGENT",
        explanation: "Creates a deadline.",
        extra: "ignored",
      },
    ],
    safe_next_steps: ["Do not pay."],
    verification_guidance: ["Use the official portal."],
    disclaimer: "Not legal advice.",
  };

  const response = buildAnalysisResponse(TEXT, rules, "en", aiResult);

  assert.equal(response.risk_level, "MEDIUM");
  assert.equal(response.calculated_score, 60);
  assert.equal(response.situation_type, aiResult.situation_type);
  assert.equal(response.summary, aiResult.summary);
  assert.deepEqual(response.red_flags, [
    {
      indicator: "Urgency",
      evidence: "URGENT",
      explanation: "Creates a deadline.",
    },
  ]);
  assert.deepEqual(response.safe_next_steps, ["Do not pay."]);
  assert.deepEqual(response.verification_guidance, ["Use the official portal."]);
  assert.equal(response.disclaimer, "Not legal advice.");
  assert.equal(response.rule_breakdown.length, 6);
  assert.equal(response.rule_breakdown[0].evidence, "immediately, URGENT");
  assert.equal(response.rule_breakdown[2].classification, "unverified");
});

test("rules-only fallback uses Python rule results and fallback text", () => {
  const rules = makeRuleResults();
  const response = fallbackResponse(TEXT, rules, "en");

  assert.equal(response.risk_level, "MEDIUM");
  assert.equal(response.calculated_score, 60);
  assert.equal(response.situation_type, FALLBACK_TEXT.en.situation.MEDIUM);
  assert.equal(response.summary, FALLBACK_TEXT.en.summary.MEDIUM);
  assert.deepEqual(response.safe_next_steps, FALLBACK_TEXT.en.safe_next_steps);
  assert.deepEqual(
    response.verification_guidance,
    FALLBACK_TEXT.en.verification_guidance,
  );
  assert.equal(response.disclaimer, FALLBACK_TEXT.en.disclaimer);
  assert.equal(response.red_flags.length, 1);
  assert.deepEqual(response.red_flags[0], {
    indicator: "Urgent deadline or coercion",
    evidence: "immediately, URGENT",
    explanation: "Coercive urgency or deadline indicators detected.",
  });
  assert.deepEqual(response.urgency_phrases, ["immediately", "URGENT"]);
});

test("fallback uses the first 200 characters when a rule has no evidence", () => {
  const rules = makeRuleResults({
    rule_breakdown: makeRuleBreakdown().map((row, index) =>
      index === 0 ? { ...row, evidence: "" } : row,
    ),
  });
  const longText = "a".repeat(250);
  const response = fallbackResponse(longText, rules, "en");

  assert.equal(response.red_flags[0].evidence, "a".repeat(200));
});

test("Hindi fallback uses Hindi rule names and Hindi messages", () => {
  const rules = makeRuleResults({
    language: "hi",
    risk_level: "HIGH",
    rule_score: 82,
  });
  const response = fallbackResponse(TEXT, rules, "hi");

  assert.equal(response.risk_level, "HIGH");
  assert.equal(response.calculated_score, 82);
  assert.equal(response.situation_type, FALLBACK_TEXT.hi.situation.HIGH);
  assert.equal(response.summary, FALLBACK_TEXT.hi.summary.HIGH);
  assert.equal(response.rule_breakdown[0].rule, rules.rule_breakdown[0].rule_hi);
  assert.equal(response.red_flags[0].indicator, rules.rule_breakdown[0].rule_hi);
  assert.deepEqual(response.safe_next_steps, FALLBACK_TEXT.hi.safe_next_steps);
});

test("response structure remains compatible with App.jsx", () => {
  const response = fallbackResponse(TEXT, makeRuleResults(), "en");

  assert.deepEqual(
    Object.keys(response).sort(),
    [...NOTICE_ANALYSIS_REQUIRED_FIELDS].sort(),
  );

  for (const field of [
    "rule_breakdown",
    "red_flags",
    "safe_next_steps",
    "verification_guidance",
    "amounts",
    "payment_handles",
    "urgency_phrases",
    "extracted_urls",
  ]) {
    assert.ok(Array.isArray(response[field]), `${field} should be an array`);
  }

  assert.equal(typeof response.situation_type, "string");
  assert.equal(typeof response.summary, "string");
  assert.equal(typeof response.disclaimer, "string");
  assert.equal(typeof response.calculated_score, "number");
  assert.ok(["LOW", "MEDIUM", "HIGH"].includes(response.risk_level));

  for (const row of response.rule_breakdown) {
    assert.deepEqual(
      Object.keys(row).sort(),
      [...RULE_BREAKDOWN_REQUIRED_FIELDS].sort(),
    );
  }
  assert.equal(response.rule_breakdown[0].evidence, "immediately, URGENT");

  for (const flag of response.red_flags) {
    assert.deepEqual(
      Object.keys(flag).sort(),
      [...RED_FLAG_REQUIRED_FIELDS].sort(),
    );
  }
});

test("ruleRows preserves raw evidence and applies Hindi names", () => {
  const rows = ruleRows(makeRuleResults(), "en");
  assert.equal(rows[0].evidence, "immediately, URGENT");
  assert.equal(rows[0].rule, "Urgent deadline or coercion");

  const hindiRows = ruleRows(makeRuleResults({ language: "hi" }), "hi");
  assert.equal(hindiRows[0].rule, "तुरंत कार्रवाई का दबाव या धमकी");
});
