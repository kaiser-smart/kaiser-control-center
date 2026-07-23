DELETE FROM data_box_plus_recommendations
WHERE message_id IN (
  SELECT id
  FROM data_box_plus_messages
  WHERE direction = 'sent'
);

UPDATE data_box_plus_messages
SET
  message_type = 'Odeslaná zpráva',
  status = 'Odesláno',
  risk_level = '',
  priority = 'normal',
  due_date = '',
  suggested_action = '',
  priority_reason = '',
  primary_action = 'Otevřít',
  assigned_to = '',
  archive_status = 'active',
  facts_json = '[]',
  summary = '',
  summary_source = '',
  summary_loaded = 0,
  updated_at = CURRENT_TIMESTAMP
WHERE direction = 'sent';
