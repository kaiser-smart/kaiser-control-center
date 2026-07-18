export const AI_ASSISTANT_AVATAR_PLACEHOLDER = "Čeká na avatar od Radima/Martina";

export const AI_ASSISTANTS = [
  {
    id: "sarlota",
    name: "Šarlota",
    role: "Smart asistentka",
    intro: "Hlasová asistence pro Smart odpady.",
    avatarPath: "",
    hologramPath: "/avatars/sarlota-hologram-driver.webp",
    microphonePath: "/avatars/sarlota-microphone-black.png",
    introVoiceLine: "Jsem Šarlota. Pomůžu ti ve Smart odpadech najít informace a připravit další krok.",
    agentIdEnv: "VITE_ELEVENLABS_AGENT_ID_SARLOTA",
    isProduction: true,
    isTest: false
  },
  {
    id: "sarlota-smart-2",
    name: "Šarlota Smart 2",
    role: "Testovací Smart asistentka",
    intro: "Testovací hlasová asistence pro Smart odpady.",
    avatarPath: "",
    hologramPath: "/avatars/sarlota-hologram-driver.webp",
    microphonePath: "/avatars/sarlota-microphone-black.png",
    introVoiceLine: "Jsem Šarlota Smart 2. Testovací prostředí pro Smart odpady.",
    agentIdEnv: "VITE_ELEVENLABS_AGENT_ID_SARLOTA_SMART_2",
    isProduction: false,
    isTest: true
  },
  {
    id: "marek",
    name: "Marek",
    role: "Testovací asistent",
    intro: "Testovací hlasový asistent.",
    avatarPath: "",
    microphonePath: "/avatars/sarlota-microphone-black.png",
    introVoiceLine: "Jsem Marek. Testovací asistent.",
    agentIdEnv: "VITE_ELEVENLABS_AGENT_ID_MAREK",
    isProduction: false,
    isTest: false
  }
];

export const DEFAULT_AI_ASSISTANT_ID = "sarlota";

export function assistantById(assistantId) {
  return AI_ASSISTANTS.find((assistant) => assistant.id === assistantId) || AI_ASSISTANTS[0];
}
