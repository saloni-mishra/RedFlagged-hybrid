export const KNOWLEDGE_BASE = {
  government_tax:
    "Official Indian government agencies (Income Tax Dept, GST, ED) issue formal notices " +
    "via official portals (.gov.in or .nic.in). They never demand immediate UPI transfers, " +
    "cryptocurrency, or iTunes gift cards, nor do they threaten instant arrest via WhatsApp.",
  law_enforcement:
    "Police departments, cybercrime units, and courts do not conduct 'digital arrests' " +
    "over Skype, WhatsApp video, or Telegram. Bail or penalty payments are never handled " +
    "via personal UPI handles.",
  banking:
    "RBI guidelines mandate that banks never solicit OTPs, passwords, or MPINs over SMS, " +
    "unsolicited calls, or non-official links (e.g., bit.ly, tinyurl, .xyz domains).",
};

const DEFAULT_CONTEXT =
  "Standard caution applies: Verify sender identities via independent official public contact channels.";

export function retrieveContext(text) {
  const textLower = String(text ?? "").toLowerCase();
  const matches = [];

  if (["tax", "itr", "refund", "gst"].some((keyword) => textLower.includes(keyword))) {
    matches.push(KNOWLEDGE_BASE.government_tax);
  }

  if (
    ["police", "arrest", "court", "cbi", "warrant"].some((keyword) =>
      textLower.includes(keyword),
    )
  ) {
    matches.push(KNOWLEDGE_BASE.law_enforcement);
  }

  if (
    ["bank", "kyc", "otp", "debit", "account blocked"].some((keyword) =>
      textLower.includes(keyword),
    )
  ) {
    matches.push(KNOWLEDGE_BASE.banking);
  }

  return matches.length ? matches.join("\n\n") : DEFAULT_CONTEXT;
}
