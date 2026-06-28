import { AI_ASSISTANTS, DEFAULT_AI_ASSISTANT_ID, assistantById } from "./data/aiAssistants.js";
import { createElevenLabsClientTools } from "./elevenLabsClientTools.js";
import { useElevenLabsAssistant } from "./useElevenLabsAssistant.js";

export function ElevenLabsAssistantProvider({
  apiBaseUrl = "",
  tools = {}
} = {}) {
  const clientTools = createElevenLabsClientTools(tools);
  const assistant = useElevenLabsAssistant({
    apiBaseUrl,
    clientTools
  });

  return {
    assistants: AI_ASSISTANTS,
    defaultAssistantId: DEFAULT_AI_ASSISTANT_ID,
    assistantById,
    clientTools,
    closeVoiceSession: assistant.closeVoiceSession,
    closeTextSession: assistant.closeTextSession,
    prepareSignedUrl: assistant.prepareSignedUrl,
    sendTextMessage: assistant.sendTextMessage,
    startVoiceConversation: assistant.startVoiceConversation,
    sendVoiceMessage: assistant.sendVoiceMessage,
    stopVoiceAudio: assistant.stopVoiceAudio,
    unlockVoiceAudio: assistant.unlockVoiceAudio
  };
}
