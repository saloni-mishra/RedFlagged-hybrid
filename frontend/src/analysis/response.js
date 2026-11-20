import { FALLBACK_TEXT } from "./fallbackText.js";

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function firstCodePoints(text, limit) {
  return Array.from(String(text ?? "")).slice(0, limit).join("");
}

export function ruleRows(ruleResults, language) {
  return asArray(ruleResults?.rule_breakdown).map((item) => ({
    rule:
      language === "hi" && item?.rule_hi
        ? item.rule_hi
        : (item?.rule ?? ""),
    points: item?.points ?? 0,
    triggered: Boolean(item?.triggered),
    explanation: item?.explanation ?? "",
    // The current Pydantic model omits this field, but App.jsx uses it for
    // evidence highlighting. Keep it from the raw Python rule result.
    evidence: item?.evidence ?? "",
    classification: item?.classification ?? "",
  }));
}

/**
 * Build a complete rules-only NoticeAnalysisResponse.
 */
export function fallbackResponse(text, ruleResults, language) {
  const lang = language === "hi" ? "hi" : "en";
  const texts = FALLBACK_TEXT[lang];
  const level = ruleResults.risk_level;

  const redFlags = asArray(ruleResults?.rule_breakdown)
    .filter((item) => item?.triggered)
    .map((item) => ({
      indicator:
        lang === "hi" && item?.rule_hi ? item.rule_hi : (item?.rule ?? ""),
      evidence: item?.evidence || firstCodePoints(text, 200),
      explanation: item?.explanation ?? "",
    }));

  return {
    situation_type: texts.situation[level],
    risk_level: level,
    calculated_score: ruleResults.rule_score,
    rule_breakdown: ruleRows(ruleResults, language),
    summary: texts.summary[level],
    red_flags: redFlags,
    safe_next_steps: [...texts.safe_next_steps],
    verification_guidance: [...texts.verification_guidance],
    disclaimer: texts.disclaimer,
    amounts: [...asArray(ruleResults.amounts)],
    payment_handles: [...asArray(ruleResults.payment_handles)],
    urgency_phrases: [...asArray(ruleResults.urgency_phrases)],
    extracted_urls: [...asArray(ruleResults.extracted_urls)],
  };
}

/**
 * Merge AI narrative output with the deterministic rule result.
 * The AI's risk_level and score are deliberately ignored.
 */
export function buildAnalysisResponse(text, ruleResults, language, aiResult) {
  const ai = aiResult ?? {};

  return {
    situation_type: ai.situation_type ?? "",
    risk_level: ruleResults.risk_level,
    calculated_score: ruleResults.rule_score,
    rule_breakdown: ruleRows(ruleResults, language),
    summary: ai.summary ?? "",
    red_flags: asArray(ai.red_flags).map((flag) => ({
      indicator: flag?.indicator ?? "",
      evidence: flag?.evidence ?? "",
      explanation: flag?.explanation ?? "",
    })),
    safe_next_steps: [...asArray(ai.safe_next_steps)],
    verification_guidance: [...asArray(ai.verification_guidance)],
    disclaimer: ai.disclaimer ?? "",
    amounts: [...asArray(ruleResults.amounts)],
    payment_handles: [...asArray(ruleResults.payment_handles)],
    urgency_phrases: [...asArray(ruleResults.urgency_phrases)],
    extracted_urls: [...asArray(ruleResults.extracted_urls)],
  };
}
