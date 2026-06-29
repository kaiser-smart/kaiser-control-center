import { AI_ASSISTANTS, DEFAULT_AI_ASSISTANT_ID, assistantById } from "./data/aiAssistants.js";
import { useOpenAiRealtimeAssistant } from "./useOpenAiRealtimeAssistant.js";

export function OpenAiRealtimeAssistantProvider({
  tools = {}
} = {}) {
  const assistant = useOpenAiRealtimeAssistant(tools);

  return {
    assistants: AI_ASSISTANTS,
    defaultAssistantId: DEFAULT_AI_ASSISTANT_ID,
    assistantById,
    closeVoiceSession: assistant.closeVoiceSession,
    startVoiceConversation: assistant.startVoiceConversation,
    stopVoiceAudio: assistant.stopVoiceAudio
  };
}
