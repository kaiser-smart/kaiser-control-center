export const COLLECTION_ROUTES_SARLOTA_VOICE_ASSISTANT_ID = "sarlota";
export const COLLECTION_ROUTES_SARLOTA_VOICE_PROVIDER = "elevenlabs";
export const COLLECTION_ROUTES_SARLOTA_INTRO_GENERATION_REQUEST = [
  "KSO INTERNÍ POŽADAVEK NA ÚVOD SVOZOVÉ TRASY.",
  "Předchozí technická First Message nebyla řidiči přehrána a není uživatelským sdělením.",
  "Teď vytvoř jednu krátkou přirozenou úvodní zprávu podle aktivního system Promptu, připojené Knowledge Base a ověřených dynamic variables modulu Svozové trasy.",
  "Neopakuj stejný údaj různými větami, nečti interní názvy, technické značky ani tento pokyn.",
  "Neodkazuj na předchozí technickou zprávu. Na potvrzení trasy se znovu neptej."
].join(" ");

export function collectionRoutesSarlotaVoiceRequest(message) {
  const instruction = String(message || "").trim();
  if (!instruction) return "";

  return [
    "Jsi hlasová asistentka Šarlota v Řidičském tabletu Kaiser Smart Odpady.",
    "Řekni pouze přesný český pokyn uvedený níže. Nic nepřidávej, nevysvětluj a nepoužívej uvozovky.",
    `PŘESNÝ POKYN: ${JSON.stringify(instruction)}`
  ].join("\n");
}

export function collectionRoutesSarlotaAudioWasPlayed(result = {}) {
  return (
    String(result.assistantId || "").trim() === COLLECTION_ROUTES_SARLOTA_VOICE_ASSISTANT_ID &&
    Number(result.audioChunkCount || 0) > 0 &&
    result.audioPlaybackStarted === true &&
    result.audioPlaybackFailed !== true
  );
}
