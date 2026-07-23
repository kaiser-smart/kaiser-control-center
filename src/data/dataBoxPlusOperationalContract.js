export const DATA_BOX_PLUS_OPERATIONAL_CONTRACT = Object.freeze({
  id: "data-box-plus",
  sourceOfTruth: "DATA_BOX_PLUS_MANTRA",
  route: "/datove-schranky-plus",
  mode: "production",
  mailboxCount: 7,
  storage: Object.freeze({
    operationalDatabase: "SMART_ODPADY_DB",
    attachmentBucket: "SMART_ODPADY_DOCUMENTS",
    credentialStore: "encrypted-dsp-vault-or-cloudflare-secrets",
    browserStorageAllowed: false
  }),
  sync: Object.freeze({
    intervalMinutes: 60,
    schedule: "0 * * * *",
    runner: "cloudflare-worker",
    requiresOpenBrowser: false,
    auditRequired: true,
    lastRunRequired: true
  }),
  messageDirections: Object.freeze({
    received: Object.freeze({
      aiProcessing: true,
      workflowActions: true,
      automationMatching: true
    }),
    sent: Object.freeze({
      historyOnly: true,
      aiProcessing: false,
      workflowActions: false,
      automationMatching: false
    })
  }),
  externalSending: Object.freeze({
    emailAutomatic: false,
    dataBoxReplyAutomatic: false,
    newDataBoxMessageAutomatic: false,
    physicalConfirmationRequired: true,
    recipientReviewRequired: true,
    subjectReviewRequired: true,
    attachmentReviewRequired: true,
    idempotencyRequired: true,
    auditRequired: true
  }),
  automation: Object.freeze({
    cloudRunner: true,
    emailMode: "prepare-for-manual-confirmation",
    replyMode: "prepare-for-manual-confirmation",
    archiveMode: "manual-unless-explicit-informational-allowlist",
    sentMessagesExcluded: true
  }),
  credentials: Object.freeze({
    managePermission: "data-box-plus:manage",
    encryptedAtRest: true,
    frontendMayReadPassword: false,
    apiMayReturnPassword: false,
    auditChanges: true
  }),
  ui: Object.freeze({
    replyActionAlwaysVisible: true,
    detailDesktop: "right-panel",
    detailMobile: "full-screen",
    pdfPreviewButtonRequired: true,
    technicalDataHiddenByDefault: true
  })
});
