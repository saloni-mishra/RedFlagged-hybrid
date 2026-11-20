export const RED_FLAG_JSON_SCHEMA = {
  type: "object",
  properties: {
    indicator: { type: "string" },
    evidence: { type: "string" },
    explanation: { type: "string" },
  },
  required: ["indicator", "evidence", "explanation"],
  additionalProperties: false,
};

export const GEMINI_ANALYSIS_JSON_SCHEMA = {
  type: "object",
  properties: {
    situation_type: { type: "string" },
    risk_level: {
      type: "string",
      enum: ["LOW", "MEDIUM", "HIGH"],
    },
    summary: { type: "string" },
    red_flags: {
      type: "array",
      items: RED_FLAG_JSON_SCHEMA,
    },
    safe_next_steps: {
      type: "array",
      items: { type: "string" },
    },
    verification_guidance: {
      type: "array",
      items: { type: "string" },
    },
    disclaimer: { type: "string" },
  },
  required: [
    "situation_type",
    "risk_level",
    "summary",
    "red_flags",
    "safe_next_steps",
    "verification_guidance",
    "disclaimer",
  ],
  additionalProperties: false,
};

/**
 * AI-only response schema. This is the Stage 3 Gemini schema restricted to the
 * structured-output fields documented for both cloud and on-device models:
 * type, properties, required, items, and enum.
 */
export const AI_RED_FLAG_SCHEMA = {
  type: "object",
  properties: {
    indicator: { type: "string" },
    evidence: { type: "string" },
    explanation: { type: "string" },
  },
  required: ["indicator", "evidence", "explanation"],
};

export const GEMINI_ANALYSIS_AI_SCHEMA = {
  type: "object",
  properties: {
    situation_type: { type: "string" },
    risk_level: {
      type: "string",
      enum: ["LOW", "MEDIUM", "HIGH"],
    },
    summary: { type: "string" },
    red_flags: {
      type: "array",
      items: AI_RED_FLAG_SCHEMA,
    },
    safe_next_steps: {
      type: "array",
      items: { type: "string" },
    },
    verification_guidance: {
      type: "array",
      items: { type: "string" },
    },
    disclaimer: { type: "string" },
  },
  required: [
    "situation_type",
    "risk_level",
    "summary",
    "red_flags",
    "safe_next_steps",
    "verification_guidance",
    "disclaimer",
  ],
};

export const RULE_BREAKDOWN_JSON_SCHEMA = {
  type: "object",
  properties: {
    rule: { type: "string" },
    points: { type: "integer" },
    triggered: { type: "boolean" },
    explanation: { type: "string" },
    evidence: { type: "string" },
    classification: { type: "string" },
  },
  required: [
    "rule",
    "points",
    "triggered",
    "explanation",
    "evidence",
    "classification",
  ],
  additionalProperties: false,
};

export const NOTICE_ANALYSIS_JSON_SCHEMA = {
  type: "object",
  properties: {
    situation_type: { type: "string" },
    risk_level: {
      type: "string",
      enum: ["LOW", "MEDIUM", "HIGH"],
    },
    calculated_score: {
      type: "integer",
      minimum: 0,
      maximum: 100,
    },
    rule_breakdown: {
      type: "array",
      items: RULE_BREAKDOWN_JSON_SCHEMA,
    },
    summary: { type: "string" },
    red_flags: {
      type: "array",
      items: RED_FLAG_JSON_SCHEMA,
    },
    safe_next_steps: {
      type: "array",
      items: { type: "string" },
    },
    verification_guidance: {
      type: "array",
      items: { type: "string" },
    },
    disclaimer: { type: "string" },
    amounts: {
      type: "array",
      items: { type: "string" },
    },
    payment_handles: {
      type: "array",
      items: { type: "string" },
    },
    urgency_phrases: {
      type: "array",
      items: { type: "string" },
    },
    extracted_urls: {
      type: "array",
      items: { type: "string" },
    },
  },
  required: [
    "situation_type",
    "risk_level",
    "calculated_score",
    "rule_breakdown",
    "summary",
    "red_flags",
    "safe_next_steps",
    "verification_guidance",
    "disclaimer",
    "amounts",
    "payment_handles",
    "urgency_phrases",
    "extracted_urls",
  ],
  additionalProperties: false,
};

export const NOTICE_ANALYSIS_REQUIRED_FIELDS =
  NOTICE_ANALYSIS_JSON_SCHEMA.required;

export const RULE_BREAKDOWN_REQUIRED_FIELDS =
  RULE_BREAKDOWN_JSON_SCHEMA.required;

export const RED_FLAG_REQUIRED_FIELDS = RED_FLAG_JSON_SCHEMA.required;
