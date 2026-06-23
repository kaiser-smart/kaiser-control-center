export const AI_ASSISTANT_AVATAR_PLACEHOLDER = "Čeká na avatar od Radima/Martina";

export const AI_ASSISTANTS = [
  {
    id: "sarlota",
    name: "Šarlota",
    role: "Smart pomocník",
    intro: "Jsem Šarlota. Pomůžu vám ve Smart odpadech.",
    avatarPath: "/avatars/sarlota.png",
    microphonePath: "/avatars/marek-microphone.png",
    introVoiceLine: "Ahoj, jsem Šarlota. Pomůžu vám ve Smart odpadech najít informace a bezpečně vás provést dalším krokem.",
    agentIdEnv: "VITE_ELEVENLABS_AGENT_ID_SARLOTA"
  },
  {
    id: "marek",
    name: "Marek",
    role: "AI asistent",
    intro: "Ahoj, jsem Marek. Pomůžu ti ve Smart odpadech najít informace, zapsat hlášení nebo vyřídit další krok.",
    avatarPath: "/avatars/marek.png",
    microphonePath: "/avatars/marek-microphone.png",
    introVoiceLine: "Ahoj, jsem Marek. Pomůžu ti ve Smart odpadech najít informace, zapsat hlášení nebo vyřídit další krok.",
    agentIdEnv: "VITE_ELEVENLABS_AGENT_ID_MAREK"
  }
];

export const DEFAULT_AI_ASSISTANT_ID = "sarlota";

export function assistantById(assistantId) {
  return AI_ASSISTANTS.find((assistant) => assistant.id === assistantId) || AI_ASSISTANTS[0];
}
