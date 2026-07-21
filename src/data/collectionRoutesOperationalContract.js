export const COLLECTION_ROUTES_OPERATIONAL_CONTRACT = Object.freeze({
  id: "collection-routes",
  sourceOfTruth: "COLLECTION_ROUTES_MANTRA",
  routes: Object.freeze({
    module: "/trasy-svozu",
    tabletTest: "/trasy-svozu/test"
  }),
  driverTablet: Object.freeze({
    vendor: "Blackview",
    model: "Active 7 LTE",
    displayInches: 11,
    physicalWidth: 1920,
    physicalHeight: 1200,
    cssWidth: 960,
    cssHeight: 600,
    orientation: "landscape",
    aspectRatio: "16:10",
    operatingSystem: "Android 15",
    simulatorDevice: "blackview",
    viewportProfile: "blackview-active-7-landscape",
    viewportBounds: Object.freeze({
      minWidth: 900,
      maxWidth: 1024,
      minHeight: 500,
      maxHeight: 640
    })
  }),
  voice: Object.freeze({
    assistantKey: "sarlota",
    currentModule: "Svozové trasy",
    routePrefix: "/trasy-svozu",
    introVariable: "intro_announcement",
    introSource: "elevenlabs_agent_prompt_kb",
    firstMessageTemplate: "{{intro_announcement}}",
    technicalFirstMessageMarker: "KSO_INTRO_GENERATION_PENDING",
    suppressTechnicalFirstMessage: true,
    generateAudibleIntroWithActiveAgent: true,
    bufferGeneratedIntroUntilValidated: true,
    rejectForeignOperationalFacts: true,
    hologramRequiresScheduledAudio: true,
    requireRunningAudioContext: true,
    weatherMaxAgeMinutes: 45,
    weatherMustUseExactVerifiedSummary: true,
    introGongUrl: "/audio/sarlota-gong-intro.mp3",
    outroGongUrl: "/audio/sarlota-gong-outro.mp3",
    automaticSpeechRequiresIntroGong: true,
    ordinaryReplyRequiresIntroGong: false,
    introSilenceTimeoutMs: 5000,
    introSpeechActivityFrames: 2,
    introServerVadSpeakingLevel: 0.55,
    responseWindowEndsOnVoiceActivityBeforeTranscript: true,
    automaticIntroMicrophoneEnabled: false,
    automaticResponseWindowMicrophoneEnabled: true,
    automaticIntroUi: "hologram_only",
    automaticIntroShowsMicrophoneUi: false,
    voiceCueProviderRequired: true,
    hologramLifecycle: Object.freeze([
      "preparing",
      "intro_gong",
      "agent_speaking",
      "response_listening",
      "conversation",
      "outro_gong"
    ]),
    automaticIntroClosingQuestion: true,
    automaticIntroResponseMode: "hologram_voice_window",
    automaticIntroKeepsHologramVisibleDuringResponseWindow: true,
    manualContinuationRepeatsClosingQuestion: false,
    continueConversationAfterDriverReply: true,
    responseWindowTimeoutEndsEngagedConversation: false,
    suppressAgentSpeechBeforeDriverReply: true,
    persistIntroStartServerSide: true,
    oneIntroPerRouteOrTestSession: true,
    fuelSource: "T-Cars.knihaJizdVozidlo.jizdaStavPhm",
    fuelUnitMayBeInferred: false,
    requireLivePromptInTest: true,
    requireLiveKnowledgeBaseInTest: true
  }),
  testScope: Object.freeze({
    scope: "test",
    forbiddenEffects: Object.freeze([
      "production-route-write",
      "vistos-write",
      "production-gps-write",
      "customer-contact",
      "unapproved-internal-email",
      "unapproved-internal-sms",
      "rcs"
    ])
  }),
  incidentQueue: Object.freeze({
    defaultScope: "production",
    statuses: Object.freeze(["new", "claimed", "in_progress", "resolved"]),
    productionExternalSendingEnabled: false,
    testExternalSendingEnabled: false,
    testCommunicationAdapter: "simulated-provider",
    deliveryRequiresProviderWebhook: true,
    technicalDetailsRoles: Object.freeze(["admin", "management"]),
    physicalConfirmationRequired: true
  })
});

export function collectionRoutesDriverTabletLabel() {
  const device = COLLECTION_ROUTES_OPERATIONAL_CONTRACT.driverTablet;
  return `${device.vendor} ${device.model} · ${device.displayInches}″`;
}

export function collectionRoutesDriverTabletCssSizeLabel() {
  const device = COLLECTION_ROUTES_OPERATIONAL_CONTRACT.driverTablet;
  return `${device.cssWidth} × ${device.cssHeight} CSS px`;
}
