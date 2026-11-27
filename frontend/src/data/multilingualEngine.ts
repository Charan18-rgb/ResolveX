import type {
  AmbiguityCategory,
  ClarificationQuestion,
  CodeMixedTokenInfo,
  Interpretation,
  LanguageOption,
  MultilingualAnalysisMetadata,
  MultilingualSampleCase,
  ResolvedLanguage,
} from "@/types/resolvex";

export const LANGUAGE_OPTIONS: LanguageOption[] = [
  "Auto Detect",
  "English",
  "Kannada",
  "Hindi",
  "Hinglish",
  "Kanglish",
];

export const MULTILINGUAL_SAMPLE_CASES: MultilingualSampleCase[] = [
  {
    id: "ml-kanglish-deploy",
    title: "Kanglish Code-Mixed Ops",
    language: "Kanglish",
    tag: "Kanglish + English",
    domain: "Software Engineering",
    prompt:
      "Auth service na bega update madi matte adanna deploy madi, adre recent user sessions intact irabeku.",
    normalizedHint:
      "Update the auth service and deploy it soon, while keeping recent user sessions intact.",
    isCodeMixed: true,
  },
  {
    id: "ml-hinglish-deploy",
    title: "Hinglish Deployment Command",
    language: "Hinglish",
    tag: "Hinglish + English",
    domain: "Software Engineering",
    prompt:
      "Auth service ko jaldi update karo aur isko deploy kar do, par recent user sessions safe rehne chahiye.",
    normalizedHint:
      "Update the auth service and deploy it soon, ensuring recent user sessions stay safe.",
    isCodeMixed: true,
  },
  {
    id: "ml-kannada-mixed",
    title: "Kannada Script + Tech Mix",
    language: "Kannada",
    tag: "ಕನ್ನಡ + English",
    domain: "Software Engineering",
    prompt:
      "auth service ಅನ್ನು ಬೇಗ update ಮಾಡಿ ಮತ್ತು ಅದನ್ನು deploy ಮಾಡಿ, ಆದರೆ ಇತ್ತೀಚಿನ user sessions ಹಾಗೇ ಇರಲಿ.",
    normalizedHint:
      "Update the auth service soon and deploy it, while preserving recent user sessions.",
    isCodeMixed: true,
  },
  {
    id: "ml-hindi-mixed",
    title: "Hindi Script + Tech Mix",
    language: "Hindi",
    tag: "हिन्दी + English",
    domain: "Software Engineering",
    prompt: "auth service को जल्दी update करो और इसे deploy करो, लेकिन हाल के user sessions सुरक्षित रहें।",
    normalizedHint:
      "Update the auth service soon and deploy it, while keeping recent user sessions intact.",
    isCodeMixed: true,
  },
  {
    id: "ml-hindi-analytics",
    title: "Hindi Analytics Request",
    language: "Hindi",
    tag: "हिन्दी + Analytics",
    domain: "Data & Analytics",
    prompt: "पिछले quarter के top performing regions निकालो और anomalies को साफ करके उन्हें भेज दो।",
    normalizedHint:
      "Pull the top performing regions from last quarter, clean up anomalies, and share them.",
    isCodeMixed: true,
  },
];

const KANGLISH_LEXICON: Record<string, string> = {
  bega: "soon / quickly",
  madi: "do / execute",
  madu: "do / perform",
  adanna: "it / that",
  idanna: "this",
  matte: "and / again",
  adre: "but / however",
  ella: "all / every",
  avru: "they / them",
  irabeku: "must remain",
  kelasa: "task / work",
  swalpa: "some / slightly",
  nodri: "check / review",
  kalisi: "send / share",
  yavaga: "when",
  beku: "required / needed",
  hogi: "go / proceed",
};

const HINGLISH_LEXICON: Record<string, string> = {
  jaldi: "soon / quickly",
  karo: "do / execute",
  karna: "to do",
  isko: "it / this",
  usko: "it / that",
  sab: "all / every",
  sabhi: "all",
  abhi: "now / immediately",
  baad: "later",
  par: "but",
  aur: "and",
  bhejo: "send / share",
  dekho: "check / inspect",
  chahiye: "must / needed",
  rehne: "remain",
  thoda: "some / slightly",
  kuch: "anything / some",
  unka: "their",
};

const KANNADA_UNICODE_LEXICON: Record<string, string> = {
  ಬೇಗ: "soon / quickly",
  ಅದನ್ನು: "it / that",
  ಇದನ್ನು: "this",
  ಇತ್ತೀಚಿನ: "recent",
  ಎಲ್ಲಾ: "all",
  ಮಾಡಿ: "do / execute",
  ಮತ್ತು: "and",
  ಆದರೆ: "but",
  ಹಾಗೇ: "intact / as-is",
  ಇರಲಿ: "must stay",
  ಏನಾದರೂ: "anything",
  ತಂಡಕ್ಕೆ: "to the team",
  ತಿಳಿಸಿ: "notify",
};

const HINDI_UNICODE_LEXICON: Record<string, string> = {
  जल्दी: "soon / quickly",
  इसे: "it / this",
  उसे: "that",
  उन्हें: "them",
  सभी: "all",
  सब: "all",
  हाल: "recent",
  पिछले: "last / previous",
  करो: "do / execute",
  और: "and",
  लेकिन: "but",
  सुरक्षित: "safe / intact",
  रहें: "remain",
  निकालो: "pull / extract",
  साफ: "clean up",
  भेज: "send / share",
};

export interface MultilingualHeuristicToken {
  token: string;
  category: AmbiguityCategory;
  severity: number;
  reasonByLang: Partial<Record<ResolvedLanguage, string>>;
  defaultReason: string;
  meanings: string[];
}

export const MULTILINGUAL_AMBIGUOUS_TOKENS: MultilingualHeuristicToken[] = [
  {
    token: "ಬೇಗ",
    category: "Temporal",
    severity: 86,
    defaultReason:
      'Kannada temporal word "ಬೇಗ" (soon/quickly) lacks a specific deployment window or SLA.',
    reasonByLang: {
      Kannada: 'ಕನ್ನಡದ "ಬೇಗ" ಪದವು ನಿಖರ ಸಮಯ ಅಥವಾ ನಿರ್ವಹಣಾ ವಿಂಡೋವನ್ನು ಸೂಚಿಸುವುದಿಲ್ಲ.',
      Kanglish: '"Bega" (Kannada: soon) does not specify an exact deployment window or SLA.',
    },
    meanings: ["Immediate canary rollout", "Scheduled 02:00 UTC window", "After CI verification"],
  },
  {
    token: "ಅದನ್ನು",
    category: "Referential",
    severity: 72,
    defaultReason:
      'Kannada pronoun "ಅದನ್ನು" (it/that) could refer to auth service alone or the gateway stack.',
    reasonByLang: {
      Kannada: '"ಅದನ್ನು" ಎಂಬ ಸರ್ವನಾಮವು ಕೇವಲ auth service ಅಥವಾ ಪೂರ್ಣ gateway stack ಅನ್ನು ಸೂಚಿಸಬಹುದು.',
    },
    meanings: ["Auth microservice only", "Auth service + API gateway"],
  },
  {
    token: "ಇತ್ತೀಚಿನ",
    category: "Scope",
    severity: 89,
    defaultReason:
      'Kannada quantifier "ಇತ್ತೀಚಿನ" (recent) has no explicit TTL boundary (60m vs. 24h).',
    reasonByLang: {
      Kannada: '"ಇತ್ತೀಚಿನ" ಪದಕ್ಕೆ ಸ್ಪಷ್ಟ ಸಮಯ ಮಿತಿ (60 ನಿಮಿಷ vs 24 ಗಂಟೆ) ನಿಗದಿಯಾಗಿಲ್ಲ.',
    },
    meanings: ["Active in last 60 minutes", "All non-expired 24h sessions"],
  },
  {
    token: "जल्दी",
    category: "Temporal",
    severity: 86,
    defaultReason:
      'Hindi temporal modifier "जल्दी" (soon/quickly) has no concrete execution window.',
    reasonByLang: {
      Hindi: 'हिन्दी शब्द "जल्दी" किसी निश्चित समय या मेंटेनेंस विंडो को स्पष्ट नहीं करता।',
    },
    meanings: ["Immediate 10% canary", "Off-peak 02:00 UTC window", "After CI approval"],
  },
  {
    token: "इसे",
    category: "Referential",
    severity: 72,
    defaultReason:
      'Hindi pronoun "इसे" (it/this) leaves target scope (service vs. full stack) ambiguous.',
    reasonByLang: {
      Hindi: 'सर्वनाम "इसे" यह स्पष्ट नहीं करता कि केवल auth service deploy करनी है या पूरा API gateway।',
    },
    meanings: ["Auth microservice only", "Auth service + API gateway"],
  },
  {
    token: "हाल के",
    category: "Scope",
    severity: 88,
    defaultReason: 'Hindi temporal scope "हाल के" (recent) lacks an explicit session TTL cutoff.',
    reasonByLang: {
      Hindi: '"हाल के" से यह तय नहीं होता कि 60 मिनट के सेशन बचाने हैं या 24 घंटे के।',
    },
    meanings: ["Active in last 60 minutes", "All 24h refresh sessions"],
  },
  {
    token: "उन्हें",
    category: "Referential",
    severity: 76,
    defaultReason:
      'Hindi pronoun "उन्हें" (them) could refer to regional tables, cleaned metrics, or anomalies.',
    reasonByLang: {
      Hindi:
        'सर्वनाम "उन्हें" रिपोर्ट सारांश, साफ़ किए गए डेटा या विसंगतियों में से किसी को भी संदर्भित कर सकता है।',
    },
    meanings: ["Executive summary + CSV", "BI dashboard link"],
  },
  {
    token: "पिछले",
    category: "Temporal",
    severity: 69,
    defaultReason:
      'Hindi relative marker "पिछले" (last/previous) omits calendar vs. fiscal quarter dates.',
    reasonByLang: {
      Hindi: '"पिछले quarter" में कैलेंडर तिमाही और वित्तीय तिमाही का अंतर स्पष्ट नहीं है।',
    },
    meanings: ["Calendar quarter", "Corporate fiscal quarter"],
  },
  {
    token: "साफ",
    category: "Pragmatic",
    severity: 87,
    defaultReason: 'Hindi phrase "साफ" (clean up) leaves deletion vs. flagging policy undefined.',
    reasonByLang: {
      Hindi: '"साफ" करने का अर्थ डेटा हटाना है या केवल फ़्लैग करना—यह ऑडिट के लिए महत्वपूर्ण है।',
    },
    meanings: ["Flag & annotate only", "Exclude verified test accounts"],
  },
  {
    token: "jaldi",
    category: "Temporal",
    severity: 86,
    defaultReason:
      'Hinglish temporal marker "jaldi" (soon) lacks a scheduled window or approval gate.',
    reasonByLang: {
      Hinglish:
        'Hinglish word "jaldi" ka exact rollout window (abhi canary vs 02:00 UTC) clear nahi hai.',
    },
    meanings: ["Immediate canary rollout", "Off-peak 02:00 UTC window", "After CI checks"],
  },
  {
    token: "isko",
    category: "Referential",
    severity: 72,
    defaultReason:
      'Hinglish pronoun "isko" (it) could target auth-service alone or coupled gateway pods.',
    reasonByLang: {
      Hinglish:
        '"isko" pronoun sirf auth-service ke liye hai ya full gateway stack ke liye, yeh ambiguous hai.',
    },
    meanings: ["Auth microservice only", "Auth service + API gateway"],
  },
  {
    token: "bega",
    category: "Temporal",
    severity: 86,
    defaultReason:
      'Kanglish temporal word "bega" (soon) lacks an execution window or freeze check.',
    reasonByLang: {
      Kanglish:
        'Kanglish word "bega" yava exact deployment window (immediate canary vs 02:00 UTC) antha clear madilla.',
    },
    meanings: ["Immediate canary rollout", "Off-peak 02:00 UTC window", "After CI checks"],
  },
  {
    token: "adanna",
    category: "Referential",
    severity: 72,
    defaultReason:
      'Kanglish reference "adanna" (it) leaves single-service vs. multi-service target unclear.',
    reasonByLang: {
      Kanglish:
        '"adanna" pronoun auth-service ge mathra na athava API gateway jothe na antha clear illa.',
    },
    meanings: ["Auth microservice only", "Auth service + API gateway"],
  },
  {
    token: "madi",
    category: "Lexical",
    severity: 78,
    defaultReason:
      'Code-mixed action "madi" (do/execute) paired with update lacks deployment vs. patch specificity.',
    reasonByLang: {
      Kanglish:
        '"update madi" release build deploy madbeka, security patch haakbeka, athava config reload madbeka antha specify madilla.',
    },
    meanings: ["Deploy latest release (v2.4.2)", "Apply security patch only", "Config hot-reload"],
  },
  {
    token: "karo",
    category: "Lexical",
    severity: 78,
    defaultReason:
      'Hinglish action "karo" paired with update permits release rollout, patching, or config reload.',
    reasonByLang: {
      Hinglish:
        '"update karo" se release build deploy, security patch, ya config hot-reload clear nahi hota.',
    },
    meanings: ["Deploy latest release (v2.4.2)", "Apply security patch only", "Config hot-reload"],
  },
];

export function detectLanguageMetadata(
  prompt: string,
  requestedLanguage: LanguageOption = "Auto Detect",
): MultilingualAnalysisMetadata {
  const trimmed = prompt.trim();
  const lower = trimmed.toLowerCase();

  const hasKannada = /[\u0C80-\u0CFF]/.test(trimmed);
  const hasHindi = /[\u0900-\u097F]/.test(trimmed);
  const hasLatin = /[A-Za-z]/.test(trimmed);

  const words = lower.split(/[\s,.;:!?()]+/).filter(Boolean);
  const kanglishHits = words.filter((w) => w in KANGLISH_LEXICON);
  const hinglishHits = words.filter((w) => w in HINGLISH_LEXICON);

  let autoDetected: ResolvedLanguage = "English";
  if (hasKannada) {
    autoDetected = "Kannada";
  } else if (hasHindi) {
    autoDetected = "Hindi";
  } else if (kanglishHits.length >= hinglishHits.length && kanglishHits.length > 0) {
    autoDetected = "Kanglish";
  } else if (hinglishHits.length > 0) {
    autoDetected = "Hinglish";
  }

  const resolvedLanguage: ResolvedLanguage =
    requestedLanguage === "Auto Detect" ? autoDetected : requestedLanguage;

  const scriptsDetected: string[] = [];
  if (hasKannada) scriptsDetected.push("Kannada");
  if (hasHindi) scriptsDetected.push("Devanagari");
  if (hasLatin) {
    if (autoDetected === "Kanglish") {
      scriptsDetected.push("Latin (Kanglish + English)");
    } else if (autoDetected === "Hinglish") {
      scriptsDetected.push("Latin (Hinglish + English)");
    } else {
      scriptsDetected.push("Latin");
    }
  }
  if (scriptsDetected.length === 0) scriptsDetected.push("Unknown");

  const isCodeMixed =
    (hasKannada && hasLatin) ||
    (hasHindi && hasLatin) ||
    kanglishHits.length > 0 ||
    hinglishHits.length > 0;

  const codeMixedTokens: CodeMixedTokenInfo[] = [];
  const seenTokens = new Set<string>();

  const pushToken = (token: string, languageTag: ResolvedLanguage, normalizedMeaning: string) => {
    const key = token.toLowerCase();
    if (seenTokens.has(key)) return;
    seenTokens.add(key);
    codeMixedTokens.push({ token, languageTag, normalizedMeaning });
  };

  for (const w of kanglishHits) {
    const meaning = KANGLISH_LEXICON[w];
    if (meaning) pushToken(w, "Kanglish", meaning);
  }
  for (const w of hinglishHits) {
    const meaning = HINGLISH_LEXICON[w];
    if (meaning) pushToken(w, "Hinglish", meaning);
  }
  for (const [kWord, meaning] of Object.entries(KANNADA_UNICODE_LEXICON)) {
    if (trimmed.includes(kWord)) pushToken(kWord, "Kannada", meaning);
  }
  for (const [hWord, meaning] of Object.entries(HINDI_UNICODE_LEXICON)) {
    if (trimmed.includes(hWord)) pushToken(hWord, "Hindi", meaning);
  }

  // Normalized English meaning (separately displayed without modifying originalPrompt)
  const matchedSample = MULTILINGUAL_SAMPLE_CASES.find(
    (s) => s.prompt.trim().toLowerCase() === lower,
  );

  let normalizedEnglishMeaning = trimmed;
  if (matchedSample) {
    normalizedEnglishMeaning = matchedSample.normalizedHint;
  } else if (autoDetected !== "English" || isCodeMixed) {
    // Realistic client-side token-substitution normalization preview
    let normalized = trimmed;
    const replacements: Array<[string, string]> = [
      ...Object.entries(KANNADA_UNICODE_LEXICON).map(
        ([k, v]) => [k, (v.split("/")[0] ?? v).trim()] as [string, string],
      ),
      ...Object.entries(HINDI_UNICODE_LEXICON).map(
        ([k, v]) => [k, (v.split("/")[0] ?? v).trim()] as [string, string],
      ),
      ...Object.entries(KANGLISH_LEXICON).map(
        ([k, v]) => [k, (v.split("/")[0] ?? v).trim()] as [string, string],
      ),
      ...Object.entries(HINGLISH_LEXICON).map(
        ([k, v]) => [k, (v.split("/")[0] ?? v).trim()] as [string, string],
      ),
    ];
    for (const [src, target] of replacements) {
      normalized = normalized.replaceAll(src, target);
    }
    normalizedEnglishMeaning = `[Normalized Intent Preview] ${normalized}`;
  }

  const detectionConfidence =
    hasKannada || hasHindi
      ? 0.96
      : kanglishHits.length >= 2 || hinglishHits.length >= 2
        ? 0.91
        : autoDetected === "English"
          ? 0.94
          : 0.84;

  return {
    requestedLanguage,
    detectedLanguage: resolvedLanguage,
    isCodeMixed,
    scriptsDetected,
    detectionConfidence,
    originalPrompt: trimmed,
    normalizedEnglishMeaning,
    codeMixedTokens: codeMixedTokens.slice(0, 6),
    engineNote:
      "Mock client-side language detection & template localization. Genuine multilingual NLU/translation activates when a FastAPI backend is connected.",
  };
}

export function resolveUiLanguage(
  selectedLanguage: LanguageOption,
  detectedLanguage: ResolvedLanguage,
): ResolvedLanguage {
  return selectedLanguage === "Auto Detect" ? detectedLanguage : selectedLanguage;
}

interface QuestionTranslationEntry {
  question: string;
  necessityReason: string;
  selectionExplanation: string;
  options: Record<string, { label: string; description: string }>;
}

const QUESTION_MOCK_TRANSLATIONS: Partial<
  Record<ResolvedLanguage, Record<string, QuestionTranslationEntry>>
> = {
  Kannada: {
    "cq-sessions": {
      question: '"ಇತ್ತೀಚಿನ user sessions" ಅನ್ನು ಎಷ್ಟು ಅವಧಿಯವರೆಗೆ ಉಳಿಸಬೇಕು?',
      necessityReason:
        "ನಿಖರವಾದ session TTL ಮಿತಿಯನ್ನು ನಿರ್ಧರಿಸದಿದ್ದರೆ, rolling deploy ಸಮಯದಲ್ಲಿ ಸಕ್ರಿಯ ಬಳಕೆದಾರರು logout ಆಗಬಹುದು.",
      selectionExplanation:
        "ಮೊದಲ ಆದ್ಯತೆ (#1) — Safety & Guardrails ಕ್ಷೇತ್ರವನ್ನು ಸುರಕ್ಷಿತಗೊಳಿಸಲು ಮತ್ತು ಬಳಕೆದಾರರ ಅಡಚಣೆಯನ್ನು ತಡೆಯಲು ಆಯ್ಕೆ ಮಾಡಲಾಗಿದೆ.",
      options: {
        "opt-1h": {
          label: "ಕಳೆದ 60 ನಿಮಿಷಗಳಲ್ಲಿ ಸಕ್ರಿಯ (1h)",
          description: "Pod ಗಳನ್ನು ನಿಧಾನವಾಗಿ drain ಮಾಡಿ 1 ಗಂಟೆಯ Redis session ಉಳಿಸಿ.",
        },
        "opt-24h": {
          label: "ಎಲ್ಲಾ 24 ಗಂಟೆಯ sessions",
          description: "24 ಗಂಟೆಗಳವರೆಗೆ dual-key ಟೋಕನ್ ಮಾನ್ಯತೆಯನ್ನು ಕಾಪಾಡಿ.",
        },
      },
    },
    "cq-window": {
      question: "ಈ deployment ಅನ್ನು ಯಾವಾಗ 실행 (execute) ಮಾಡಬೇಕು?",
      necessityReason:
        '"ಬೇಗ" ಅಥವಾ "soon" ಎಂಬುದು maintenance window ಮತ್ತು production canary ಸಮಯವನ್ನು ಸ್ಪಷ್ಟಪಡಿಸುವುದಿಲ್ಲ.',
      selectionExplanation:
        "Execution Timing ಅತ್ಯಗತ್ಯ ಕ್ಷೇತ್ರವಾಗಿರುವುದರಿಂದ ಇದನ್ನು ಮುಂದಿನ ಪ್ರಶ್ನೆಯಾಗಿ ಆಯ್ಕೆ ಮಾಡಲಾಗಿದೆ.",
      options: {
        "opt-now": {
          label: "ತಕ್ಷಣವೇ (10% Canary)",
          description: "ಸ್ವಯಂಚಾಲಿತ rollback ಜೊತೆ ಈಗಲೇ 10% traffic ಬದಲಾಯಿಸಿ.",
        },
        "opt-offpeak": {
          label: "ಮುಂದಿನ Off-Peak ಸಮಯ (02:00 UTC)",
          description: "ಕಡಿಮೆ traffic ಇರುವ ಸಮಯಕ್ಕೆ deployment ನಿಗದಿಪಡಿಸಿ.",
        },
      },
    },
    "cq-target-env": {
      question: "auth service ಗೆ ಯಾವ ರೀತಿಯ update ಅನ್ವಯಿಸಬೇಕು?",
      necessityReason:
        "Release deploy, security patch ಮತ್ತು config reload ಗಳ rollback ಅಪಾಯಗಳು ವಿಭಿನ್ನವಾಗಿರುತ್ತವೆ.",
      selectionExplanation:
        'Action Scope ಸ್ಪಷ್ಟಪಡಿಸಲು ಮತ್ತು "ಅದನ್ನು / it" ಉಲ್ಲೇಖವನ್ನು ನಿಖರಗೊಳಿಸಲು ಆಯ್ಕೆ ಮಾಡಲಾಗಿದೆ.',
      options: {
        "opt-release": {
          label: "ಹೊಸ Release Build (v2.4.2)",
          description: "Canary ಮೂಲಕ ಪೂರ್ವ-ನಿರ್ಮಿತ release container deploy ಮಾಡಿ.",
        },
        "opt-security": {
          label: "Security Patch ಮಾತ್ರ",
          description: "CI ಪರೀಕ್ಷೆಯ ನಂತರ CVE ಪ್ಯಾಚ್ ಮಾತ್ರ ಅನ್ವಯಿಸಿ.",
        },
        "opt-config": {
          label: "Config Hot-Reload",
          description: "Container restart ಇಲ್ಲದೆ runtime config ನವೀಕರಿಸಿ.",
        },
      },
    },
  },
  Hindi: {
    "cq-sessions": {
      question: '"हाल के user sessions" को किस समय-सीमा तक सुरक्षित रखना है?',
      necessityReason:
        "स्पष्ट session TTL सीमा न होने पर rolling deployment से सक्रिय उपयोगकर्ता लॉग-आउट हो सकते हैं।",
      selectionExplanation:
        "प्राथमिकता #1 — Safety & Guardrails फ़ील्ड को स्पष्ट करने और आउटेज जोखिम घटाने के लिए चुना गया।",
      options: {
        "opt-1h": {
          label: "पिछले 60 मिनट में सक्रिय (1h)",
          description: "पॉड्स को धीरे ड्रेन करें और 1 घंटे की Redis कुंजियाँ सुरक्षित रखें।",
        },
        "opt-24h": {
          label: "सभी 24 घंटे के सेशन",
          description: "24 घंटे तक dual-key सत्यापन सक्रिय रखें।",
        },
      },
    },
    "cq-window": {
      question: "deployment कब निष्पादित (execute) किया जाना चाहिए?",
      necessityReason: '"जल्दी" जैसे शब्द से maintenance window और canary अनुमोदन स्पष्ट नहीं होता।',
      selectionExplanation: "Execution Timing अनिवार्य फ़ील्ड होने के कारण इसे उच्च प्राथमिकता दी गई।",
      options: {
        "opt-now": {
          label: "तुरंत (10% Canary)",
          description: "ऑटो-रोलबैक के साथ अभी 10% ट्रैफ़िक शिफ्ट शुरू करें।",
        },
        "opt-offpeak": {
          label: "अगली Off-Peak विंडो (02:00 UTC)",
          description: "सबसे कम ट्रैफ़िक अवधि के लिए शेड्यूल करें।",
        },
      },
    },
    "cq-target-env": {
      question: "auth service पर किस प्रकार का update लागू करना है?",
      necessityReason: "रिलीज़ रोलआउट, सुरक्षा पैच और कॉन्फ़िग रीलोड के रोलबैक जोखिम अलग-अलग होते हैं।",
      selectionExplanation:
        'Action Scope तय करने और सर्वनाम "इसे / it" की अस्पष्टता घटाने के लिए चुना गया।',
      options: {
        "opt-release": {
          label: "नवीनतम Release Build (v2.4.2)",
          description: "कैनरी के माध्यम से तैयार रिलीज़ कंटेनर रोल आउट करें।",
        },
        "opt-security": {
          label: "केवल Security Patch",
          description: "CI जांच के बाद केवल CVE निर्भरता पैच लागू करें।",
        },
        "opt-config": {
          label: "Config Hot-Reload",
          description: "पॉड रीस्टार्ट किए बिना रनटाइम कॉन्फ़िग अपडेट करें।",
        },
      },
    },
  },
  Hinglish: {
    "cq-sessions": {
      question: '"Recent user sessions" ko kitne time window tak safe rakhna hai?',
      necessityReason:
        "Clear TTL boundary ke bina pod restart hone par active users log out ho sakte hain.",
      selectionExplanation:
        "Rank #1 priority — Safety & Guardrails field lock karne aur user impact rokne ke liye select kiya gaya.",
      options: {
        "opt-1h": {
          label: "Last 60 Minutes Active",
          description: "Pods gracefully drain karke 1h Redis sessions bachayein.",
        },
        "opt-24h": {
          label: "Sabhi 24h Non-Expired Sessions",
          description: "24 ghante tak dual-key token validation active rakhein.",
        },
      },
    },
    "cq-window": {
      question: "Deployment kab execute hona chahiye?",
      necessityReason:
        '"Jaldi" / "soon" se exact rollout window ya maintenance freeze clear nahi hota.',
      selectionExplanation:
        "Execution Timing ek essential intent field hai, isliye isko priority par poocha gaya.",
      options: {
        "opt-now": {
          label: "Abhi Turant (10% Canary)",
          description: "Auto-rollback ke saath 10% production traffic shift karein.",
        },
        "opt-offpeak": {
          label: "Next Off-Peak Window (02:00 UTC)",
          description: "Low-traffic maintenance window mein queue karein.",
        },
      },
    },
    "cq-target-env": {
      question: "Auth service par kis type ka update apply karna hai?",
      necessityReason:
        "Release build deploy, security patch, aur config hot-reload ka risk alag hota hai.",
      selectionExplanation:
        'Action Scope finalize karne aur "isko / it" reference narrow karne ke liye select hua.',
      options: {
        "opt-release": {
          label: "Latest Release Build (v2.4.2)",
          description: "Canary rollout ke through release container deploy karein.",
        },
        "opt-security": {
          label: "Sirf Security Patch",
          description: "CI check ke baad sirf CVE dependency patch apply karein.",
        },
        "opt-config": {
          label: "Config Hot-Reload",
          description: "Pod restart ke bina runtime secrets/flags update karein.",
        },
      },
    },
  },
  Kanglish: {
    "cq-sessions": {
      question: '"Recent user sessions" na yava time limit varegu safe agi idabeku?',
      necessityReason: "Exact TTL boundary illade pods restart madre active users logout agbahudu.",
      selectionExplanation:
        "Rank #1 priority — Safety & Guardrails field confirm madoke mathu outage thadeyoke select madಲಾಗಿದೆ.",
      options: {
        "opt-1h": {
          label: "Last 60 Minutes Active",
          description: "Pods gracefully drain madi 1h Redis keys preserve madi.",
        },
        "opt-24h": {
          label: "Ella 24h Non-Expired Sessions",
          description: "24 hours varegu dual-key token validation active idi.",
        },
      },
    },
    "cq-window": {
      question: "Ee deployment yavaga execute agbeku?",
      necessityReason:
        '"Bega" / "soon" antha helidre exact rollout window athava maintenance freeze clear agalla.',
      selectionExplanation:
        "Execution Timing essential field agirodrinda next priority question agi bandide.",
      options: {
        "opt-now": {
          label: "Eegale Immediately (10% Canary)",
          description: "Auto-rollback jothe 10% traffic shift start madi.",
        },
        "opt-offpeak": {
          label: "Next Off-Peak Window (02:00 UTC)",
          description: "Low-traffic maintenance window ge queue madi.",
        },
      },
    },
    "cq-target-env": {
      question: "Auth service ge yava type update apply madbeku?",
      necessityReason:
        "Release deploy, security patch mathu config reload rollback risk bere bere iruthe.",
      selectionExplanation:
        'Action Scope lock madoke mathu "adanna / it" reference clear madoke select madide.',
      options: {
        "opt-release": {
          label: "Latest Release Build (v2.4.2)",
          description: "Canary rollout moolaka release container deploy madi.",
        },
        "opt-security": {
          label: "Security Patch Mathra",
          description: "CI check nantara CVE patch mathra apply madi.",
        },
        "opt-config": {
          label: "Config Hot-Reload",
          description: "Pod restart illade runtime config update madi.",
        },
      },
    },
  },
};

export function localizeClarificationQuestion(
  question: ClarificationQuestion,
  language: ResolvedLanguage,
): ClarificationQuestion {
  if (language === "English") return question;

  const entry = QUESTION_MOCK_TRANSLATIONS[language]?.[question.id];
  if (entry) {
    return {
      ...question,
      question: entry.question,
      necessityReason: entry.necessityReason,
      selectionExplanation: entry.selectionExplanation,
      options: question.options.map((opt) => {
        const localizedOpt = entry.options[opt.id];
        return localizedOpt
          ? {
              ...opt,
              label: localizedOpt.label,
              description: localizedOpt.description,
            }
          : opt;
      }),
    };
  }

  // Dynamic fallback localization for custom/other preset questions
  const prefixMap: Record<
    Exclude<ResolvedLanguage, "English">,
    { q: string; why: string; sel: string }
  > = {
    Kannada: {
      q: `[ಕನ್ನಡ Mock] "${question.targetToken}" ಕುರಿತು ನಿಖರ ಅರ್ಥವೇನು? — ${question.question}`,
      why: `ಅಗತ್ಯತೆ: ${question.necessityReason}`,
      sel: `ಆಯ್ಕೆ ಕಾರಣ: ${question.selectionExplanation}`,
    },
    Hindi: {
      q: `[हिन्दी Mock] "${question.targetToken}" का सटीक अर्थ चुनें — ${question.question}`,
      why: `आवश्यकता: ${question.necessityReason}`,
      sel: `चयन कारण: ${question.selectionExplanation}`,
    },
    Hinglish: {
      q: `[Hinglish] "${question.targetToken}" ka exact matlab clear karein — ${question.question}`,
      why: `Zaroori kyun hai: ${question.necessityReason}`,
      sel: `Select kyun hua: ${question.selectionExplanation}`,
    },
    Kanglish: {
      q: `[Kanglish] "${question.targetToken}" bagge exact artha heli — ${question.question}`,
      why: `Yake bekagide: ${question.necessityReason}`,
      sel: `Select madida kaarana: ${question.selectionExplanation}`,
    },
  };

  const tpl = prefixMap[language];
  return {
    ...question,
    question: tpl.q,
    necessityReason: tpl.why,
    selectionExplanation: tpl.sel,
  };
}

export function localizeInterpretationNote(
  interp: Interpretation,
  language: ResolvedLanguage,
): { localizedSummary: string; localizedDirective: string } {
  if (language === "English") {
    return {
      localizedSummary: interp.summary,
      localizedDirective: interp.simulatedIntent.resolvedDirective,
    };
  }

  const tagMap: Record<Exclude<ResolvedLanguage, "English">, string> = {
    Kannada: "ಕನ್ನಡ ಸಾರಾಂಶ (Mock)",
    Hindi: "हिन्दी सारांश (Mock)",
    Hinglish: "Hinglish Summary (Mock)",
    Kanglish: "Kanglish Summary (Mock)",
  };

  return {
    localizedSummary: `[${tagMap[language]}] ${interp.summary}`,
    localizedDirective: `[${language} Preview] ${interp.simulatedIntent.resolvedDirective}`,
  };
}

export function localizeSelectionReason(
  reason: string,
  question: ClarificationQuestion | null,
  language: ResolvedLanguage,
): string {
  if (language === "English") return reason;
  if (question) {
    const localizedQ = localizeClarificationQuestion(question, language);
    if (reason.startsWith("Targeted re-clarification") || reason.startsWith("Re-clarification")) {
      return `[${language}] ${reason}`;
    }
    return localizedQ.selectionExplanation;
  }
  return reason;
}
