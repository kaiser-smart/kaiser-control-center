# Mail Brain analysis audit

Both new-message indexing and pending-case reanalysis use `analyzeMessage()` and
the same evidence predicates as `normalizeAnalysis()`. Classification, model,
prompt and evidence acceptance conditions are unchanged.

The existing `brain_case_events` table stores only allowlisted metadata. New
messages use `analysis.result`; reanalysis enriches its existing
`analysis.attempt`. No schema change is required. Neither event contains the
email body, prompt, model response, quotation, credentials or arbitrary errors.
Case/message IDs permit correlation with existing authorized records.

The audit includes configuration booleans and eligibility reason, analyzer
invocation, request/response milestones, HTTP statuses, proposal JSON parsing,
proposal presence, quote presence/length/exact match, state validity, normalized
status, final reason and whether the case update succeeded. Quote length is the
trimmed, at-most-500-character quote evaluated by the existing validator.
`responseParsed` means the proposal JSON parsed, not just the response envelope.

`modelRequestAttempted` records dispatch to the configured transport.
`modelRequestSent=true` requires an HTTP response from the model service (directly
or acknowledged by the authenticated proxy). It is `false` before dispatch or
when the proxy rejects the request before forwarding, and `null` when delivery
cannot be established, for example after a timeout. A proxy error without an
upstream status must not be presented as a model response. Transport response
and model response have separate fields. An audit write failure is reported
without changing the existing analysis decision.

## One existing case, no history

`MAIL_BRAIN_ANALYSIS_CASE_ID` is a temporary, server-selected UUID. With this
setting, the existing authenticated SO.ai sync transport returns immediately
through `reanalyzeOne()` instead of entering history sync. This requires the
read-only pilot, its exact mailbox, scheduled Brain sync disabled, current read
grant/consent, a non-done/non-evidence-backed case without manual case actions,
an indexed source in the consented folders/window, and empty outbox.

An atomic `analysis.targeted` claim permits one attempt for that case, including
concurrent requests. It does not retry after failure. The normal reanalysis
path verifies the stored reference, RFC Message-ID and content hash before
calling the model. No history search, cursor change, new message indexing,
native mail mutation, send or outbox operation occurs. The completed result
contains only safe audit metadata. Disable the setting immediately after the
single approved request. This is not a new MCP tool or an automatic job.
