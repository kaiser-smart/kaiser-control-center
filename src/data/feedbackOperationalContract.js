export const FEEDBACK_OPERATIONAL_CONTRACT = Object.freeze({
  id: "feedback-cases",
  sourceOfTruth: "FEEDBACK_MANTRA",
  route: "/pripominky",
  detailRoute: "/pripominky/:caseId",
  mode: "production",
  storage: Object.freeze({
    operationalDatabase: "SMART_ODPADY_DB",
    attachmentBucket: "SMART_ODPADY_DOCUMENTS",
    browserStorageAuthoritative: false
  }),
  visibility: Object.freeze({
    authenticatedUsersSeeAllCases: true,
    ownCasesFilter: true,
    internalNotesForManagersOnly: true,
    technicalAuditForManagersOnly: true
  }),
  workflowStatuses: Object.freeze([
    "new",
    "accepted",
    "needs_details",
    "in_progress",
    "ready_for_verification",
    "done",
    "rejected",
    "duplicate"
  ]),
  automationStatuses: Object.freeze([
    "not_evaluated",
    "waiting_for_review",
    "suitable",
    "unsuitable",
    "proposal_ready",
    "waiting_for_approval",
    "deployed",
    "verified",
    "failed"
  ]),
  creation: Object.freeze({
    exactlyOneCase: true,
    defaultWorkflowStatus: "new",
    defaultAssignee: null,
    auditRequired: true,
    codexAutomatic: false,
    deploymentAutomatic: false
  }),
  notifications: Object.freeze({
    inAppOnImportantChange: true,
    readyForVerificationEmail: true,
    emailRequiresConfirmedProviderResult: true,
    falseDeliveryClaimsForbidden: true
  }),
  codex: Object.freeze({
    managerOnly: true,
    automaticOnReport: false,
    promptReviewRequired: true,
    configuredRunnerRequired: true,
    auditRequired: true,
    deploymentSeparate: true
  }),
  permissions: Object.freeze({
    list: "feedback:view",
    create: "feedback:create",
    manage: "self-repair:manage",
    reply: "reporter-only",
    verify: "reporter-only"
  })
});
