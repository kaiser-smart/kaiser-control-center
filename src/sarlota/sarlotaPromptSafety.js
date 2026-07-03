import { SARLOTA_DRIVER_REPORT_EL_PROMPT_RULE } from "./sarlotaSystemPrompt.js";

export const DRIVER_REPORT_PROMPT_RULE_MARKER = "HLÁŠENÍ ŘIDIČŮ / SERVIS VOZIDEL";
export const DRIVER_REPORT_PROMPT_LEGACY_RULE_MARKERS = [
  "HLÁŠENÍ ŘIDIČŮ / VOZIDLA / OVĚŘENÁ VOZIDLA ONLY",
  "HLÁŠENÍ ŘIDIČŮ / VOZIDLA"
];
export const DRIVER_REPORT_PROMPT_REQUIRED_PHRASE = "Konkrétní vozidla smíš v hlasu říct pouze tehdy";
export const FORBIDDEN_DRIVER_REPORT_PROMPT_PHRASES = [
  "Moment, načtu si " + "vozidla",
  "V hlasovém flow nikdy neříkej " + "konkrétní vozidlo",
  "Mám u tebe ověřené " + "tyto vozy",
  "Vyjmenuj " + "možnosti",
  "SPZ chtěj až jako " + "poslední možnost",
  "typ, značku nebo " + "interní název",
  "auto " + "3 brzdí divně",
  "Ford " + "Transit",
  "Škoda " + "Octavia",
  "Fiat " + "Ducato",
  "Tatra",
  "1A2 " + "3456",
  "1AB " + "2345",
  "3A4 " + "5678",
  "Zapíšu bezpečnostní závadu k vozidlu " + "3",
  "Hotovo, závada je " + "zapsaná"
];

function cleanPromptString(value) {
  return String(value ?? "").trim();
}

export function driverReportPromptRuleBlock() {
  return [
    "",
    DRIVER_REPORT_PROMPT_RULE_MARKER,
    SARLOTA_DRIVER_REPORT_EL_PROMPT_RULE,
    ""
  ].join("\n");
}

export function driverReportPromptHasCurrentRule(promptText) {
  const text = cleanPromptString(promptText);
  return text.includes(DRIVER_REPORT_PROMPT_RULE_MARKER)
    && text.includes(SARLOTA_DRIVER_REPORT_EL_PROMPT_RULE)
    && text.includes(DRIVER_REPORT_PROMPT_REQUIRED_PHRASE);
}

export function driverReportPromptForbiddenPhrases(promptText) {
  const text = cleanPromptString(promptText).toLowerCase();
  return FORBIDDEN_DRIVER_REPORT_PROMPT_PHRASES.filter((phrase) => text.includes(phrase.toLowerCase()));
}

export function driverReportPromptHasLegacyUnsafeExample(promptText) {
  return driverReportPromptForbiddenPhrases(promptText).some((phrase) => [
    "auto " + "3 brzdí divně",
    "Zapíšu bezpečnostní závadu k vozidlu " + "3",
    "Hotovo, závada je " + "zapsaná"
  ].includes(phrase));
}

export function driverReportPromptHasLegacyRule(promptText) {
  const text = cleanPromptString(promptText);
  return DRIVER_REPORT_PROMPT_LEGACY_RULE_MARKERS.some((marker) => text.includes(marker)) &&
    driverReportPromptForbiddenPhrases(text).length > 0;
}

export function driverReportPromptLineHasForbiddenPhrase(line) {
  const text = cleanPromptString(line).toLowerCase();
  return FORBIDDEN_DRIVER_REPORT_PROMPT_PHRASES.some((phrase) => text.includes(phrase.toLowerCase()));
}

export function stripLegacyDriverReportExamples(promptText) {
  const pattern = new RegExp([
    String.raw`(?:\n\s*)?Uživatel:\s*[„"]Zapiš závadu,\s*auto\s*3\s*brzdí divně\.[“”"]`,
    String.raw`\s*Odpověď:\s*[„"]Rozumím\.\s*Zapíšu bezpečnostní závadu k vozidlu\s*3\.\s*Chceš doplnit ještě krátkou poznámku\?[“”"]`,
    String.raw`\s*Uživatel:\s*[„"]Ne\.[“”"]`,
    String.raw`\s*Odpověď:\s*[„"]Hotovo,\s*závada je zapsaná\.[“”"]`
  ].join(""), "giu");

  return String(promptText ?? "").replace(pattern, "\n").trimEnd();
}

export function stripDriverReportPromptBlocks(promptText) {
  const lines = String(promptText ?? "").split(/\r?\n/);
  const output = [];
  const removableRuleMarkers = new Set([
    DRIVER_REPORT_PROMPT_RULE_MARKER,
    ...DRIVER_REPORT_PROMPT_LEGACY_RULE_MARKERS
  ]);
  let skipRuleLine = false;

  for (const line of lines) {
    const trimmed = cleanPromptString(line);
    if (removableRuleMarkers.has(trimmed)) {
      skipRuleLine = true;
      continue;
    }

    if (skipRuleLine) {
      skipRuleLine = false;
      continue;
    }

    if (driverReportPromptLineHasForbiddenPhrase(line)) {
      continue;
    }

    output.push(line);
  }

  return output.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd();
}
