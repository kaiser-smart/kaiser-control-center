export const COLLECTION_ROUTES_SARLOTA_VOICE_ASSISTANT_ID = "sarlota";
export const COLLECTION_ROUTES_SARLOTA_VOICE_PROVIDER = "elevenlabs";

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
