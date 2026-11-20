export const FALLBACK_TEXT = {
  en: {
    situation: {
      HIGH: "Likely scam (rule-based check)",
      MEDIUM: "Suspicious message (rule-based check)",
      LOW: "No clear scam indicators (rule-based check)",
    },
    summary: {
      HIGH: "The automated rule checks found several strong warning signs of fraud in this message. The detailed AI explanation is temporarily unavailable, so this result is based on the rule checks only.",
      MEDIUM: "The automated rule checks found some suspicious signs in this message. The detailed AI explanation is temporarily unavailable, so this result is based on the rule checks only.",
      LOW: "The automated rule checks did not find clear scam indicators. The detailed AI explanation is temporarily unavailable, so please still stay cautious and verify independently.",
    },
    safe_next_steps: [
      "Do not send money or click any link in this message until you have verified it.",
      "Never share an OTP, PIN, password or Aadhaar details with anyone.",
      "Contact the organisation yourself using its official website or phone number, not the details in the message.",
      "If you suspect fraud, report it on the National Cyber Crime helpline 1930 or at cybercrime.gov.in.",
    ],
    verification_guidance: [
      "Check the information on the organisation's official website or app.",
      "Do not use phone numbers or links given inside the message to verify it.",
    ],
    disclaimer:
      "This is an automated rule-based check and not legal or financial advice. Verify independently before paying money or sharing information.",
  },
  hi: {
    situation: {
      HIGH: "संभावित धोखाधड़ी (नियम-आधारित जाँच)",
      MEDIUM: "संदिग्ध संदेश (नियम-आधारित जाँच)",
      LOW: "धोखाधड़ी के स्पष्ट संकेत नहीं (नियम-आधारित जाँच)",
    },
    summary: {
      HIGH: "स्वचालित नियम-जाँच में इस संदेश में धोखाधड़ी के कई गंभीर संकेत मिले हैं। विस्तृत AI विश्लेषण अभी उपलब्ध नहीं है, इसलिए यह परिणाम केवल नियम-जाँच पर आधारित है।",
      MEDIUM: "स्वचालित नियम-जाँच में इस संदेश में कुछ संदिग्ध संकेत मिले हैं। विस्तृत AI विश्लेषण अभी उपलब्ध नहीं है, इसलिए यह परिणाम केवल नियम-जाँच पर आधारित है।",
      LOW: "स्वचालित नियम-जाँच में धोखाधड़ी के स्पष्ट संकेत नहीं मिले। विस्तृत AI विश्लेषण अभी उपलब्ध नहीं है, इसलिए फिर भी सावधानी रखें और स्वयं पुष्टि करें।",
    },
    safe_next_steps: [
      "पुष्टि किए बिना इस संदेश में दिए किसी खाते में पैसे न भेजें और किसी लिंक पर क्लिक न करें।",
      "OTP, पिन, पासवर्ड या आधार की जानकारी किसी से साझा न करें।",
      "संस्था से खुद उसकी आधिकारिक वेबसाइट या फोन नंबर के ज़रिए संपर्क करें, संदेश में दिए विवरण से नहीं।",
      "धोखाधड़ी का शक हो तो राष्ट्रीय साइबर अपराध हेल्पलाइन 1930 या cybercrime.gov.in पर रिपोर्ट करें।",
    ],
    verification_guidance: [
      "संस्था की आधिकारिक वेबसाइट या ऐप पर जानकारी की पुष्टि करें।",
      "पुष्टि के लिए संदेश में दिए फोन नंबर या लिंक का उपयोग न करें।",
    ],
    disclaimer:
      "यह स्वचालित नियम-आधारित जाँच है, कानूनी या वित्तीय सलाह नहीं। पैसे भेजने या जानकारी साझा करने से पहले स्वयं पुष्टि करें।",
  },
};
