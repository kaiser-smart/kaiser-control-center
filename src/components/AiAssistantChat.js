import { AiVoiceAssistantPanel } from "./AiVoiceAssistantPanel.js";
import { AiTextAssistantPanel } from "./AiTextAssistantPanel.js";

export function AiAssistantChat({
  open = false,
  mode = "text",
  messages = [],
  input = "",
  assistant = null,
  assistants = [],
  selectedAssistantId = "",
  avatarAssetStatus = {},
  elevenLabsStatus = "",
  isListening = false,
  voiceStatus = "",
  voiceUiState = "idle",
  voiceTranscript = "",
  voiceAnswer = "",
  voiceTags = [],
  demoPlaying = false,
  demoSpeaker = "",
  demoSpeakerLabel = "",
  demoLine = "",
  demoStatus = ""
} = {}) {
  if (!open) {
    return "";
  }

  const isVoiceMode = mode === "voice";

  if (isVoiceMode) {
    return AiVoiceAssistantPanel({
      open,
      assistant,
      assistants,
      selectedAssistantId,
      avatarAssetStatus,
      elevenLabsStatus,
      listening: isListening,
      voiceStatus,
      voiceUiState,
      voiceTranscript,
      voiceAnswer,
      voiceTags,
      demoPlaying,
      demoSpeaker,
      demoSpeakerLabel,
      demoLine,
      demoStatus
    });
  }

  return AiTextAssistantPanel({
    open,
    messages,
    input,
    assistant,
    assistants,
    selectedAssistantId,
    avatarAssetStatus,
    elevenLabsStatus
  });
}
