INSERT OR IGNORE INTO module_rule_audit_log (
  id,
  rule_id,
  module_key,
  action,
  changed_by_user_id,
  changed_at,
  before_json,
  after_json,
  note
)
SELECT
  'audit-absence-approval-rcs-0061',
  id,
  module_key,
  'activate_approval_rcs',
  'migration-0061',
  strftime('%Y-%m-%dT%H:%M:%fZ','now'),
  '{"approved":{"channel":"sms"},"rejected":{"channel":"sms"}}',
  '{"approved":{"channel":"rcs","fallback":"sms","template":"absence_approved"},"rejected":{"channel":"sms"}}',
  'Po ručním schválení odešle backend zaměstnanci transakční RCS přes Twilio Messaging Service se SMS fallbackem, opt-out kontrolou, deduplikací a auditem. Zamítnutí zůstává beze změny.'
FROM module_rules
WHERE id = 'absence-employee-decision-notification'
  AND module_key = 'absence';

UPDATE module_rules
SET
  title = 'Notifikace zaměstnanci po rozhodnutí',
  description = 'Po schválení odešle backend zaměstnanci transakční RCS se SMS fallbackem. Zamítnutí používá dosavadní SMS tok. Oba kanály jsou serverové a auditované.',
  status = 'active',
  conditions_json = '{"source":"absence_approval_history","toStatus":["approved","rejected"],"requiresEmployeePhone":true}',
  actions_json = '{"approved":{"notification":"absence_approved_rcs","channel":"rcs","fallback":"sms","template":"absence_approved","optOutCheck":true,"dedupe":true,"audit":"customer_message_log"},"rejected":{"notification":"absence_rejected_sms","channel":"sms"},"frontendSend":false}',
  is_automation = 1,
  trigger_type = 'event',
  schedule_cron = '',
  event_name = 'absence_request_decided',
  cloud_runner = 'backend-event',
  last_run_status = 'ready',
  last_run_message = 'RCS po schválení je aktivní přes backend; skutečný výsledek každého pokusu ukládá audit zpráv.',
  updated_by_user_id = 'migration-0061',
  updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
WHERE id = 'absence-employee-decision-notification'
  AND module_key = 'absence';
