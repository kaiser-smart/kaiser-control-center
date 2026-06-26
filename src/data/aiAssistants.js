export const AI_ASSISTANT_AVATAR_PLACEHOLDER = "Čeká na avatar od Radima/Martina";

export const AI_ASSISTANTS = [
  {
    id: "sarlota",
    name: "Šarlota",
    role: "Smart asistentka",
    intro: "Hlasová asistentka pro Smart odpady.",
    avatarPath: "",
    microphonePath: "/avatars/sarlota-microphone.png",
    introVoiceLine: "Jsem Šarlota. Pomůžu ti najít informace, připravit další krok a držet se tvých práv.",
    agentIdEnv: "VITE_ELEVENLABS_AGENT_ID_SARLOTA"
  }
];

export const DEFAULT_AI_ASSISTANT_ID = "sarlota";

export function assistantById(assistantId) {
  return AI_ASSISTANTS.find((assistant) => assistant.id === assistantId) || AI_ASSISTANTS[0];
}
