CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  actor_user_id TEXT,
  actor_email TEXT,
  actor_display_name TEXT,
  action TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id UUID,
  case_id UUID REFERENCES security_cases(id) ON DELETE SET NULL,
  alert_id UUID REFERENCES alerts(id) ON DELETE SET NULL,
  investigation_id UUID REFERENCES alert_investigations(id) ON DELETE SET NULL,
  execution_id UUID,
  outcome TEXT NOT NULL DEFAULT 'success',
  source TEXT NOT NULL DEFAULT 'app',
  ip_address TEXT,
  user_agent TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_org_created
  ON audit_logs(org_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_logs_case_created
  ON audit_logs(case_id, created_at DESC)
  WHERE case_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_audit_logs_resource_created
  ON audit_logs(resource_type, resource_id, created_at DESC)
  WHERE resource_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_audit_logs_action_created
  ON audit_logs(action, created_at DESC);

UPDATE case_events
SET event_type = CASE event_type
  WHEN 'alert_linked' THEN 'case_alert_linked'
  WHEN 'investigation_linked' THEN 'case_investigation_linked'
  WHEN 'execution_linked' THEN 'case_execution_linked'
  WHEN 'note_added' THEN 'case_note_added'
  WHEN 'status_changed' THEN 'case_status_changed'
  WHEN 'severity_changed' THEN 'case_severity_changed'
  ELSE event_type
END
WHERE event_type IN (
  'alert_linked',
  'investigation_linked',
  'execution_linked',
  'note_added',
  'status_changed',
  'severity_changed'
);

ALTER TABLE case_events
  DROP CONSTRAINT IF EXISTS case_events_type_check;

ALTER TABLE case_events
  ADD CONSTRAINT case_events_type_check CHECK (event_type IN (
    'case_created',
    'case_alert_linked',
    'case_investigation_linked',
    'case_execution_linked',
    'case_note_added',
    'case_status_changed',
    'case_severity_changed'
  ));

ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "org members can view audit logs" ON audit_logs;
CREATE POLICY "org members can view audit logs" ON audit_logs
  FOR SELECT TO authenticated
  USING (
    org_id IN (
      SELECT om.org_id
      FROM org_members om
      WHERE om.user_id = auth.jwt() ->> 'sub'
    )
  );

DROP POLICY IF EXISTS "org members can insert audit logs" ON audit_logs;
CREATE POLICY "org members can insert audit logs" ON audit_logs
  FOR INSERT TO authenticated
  WITH CHECK (
    org_id IN (
      SELECT om.org_id
      FROM org_members om
      WHERE om.user_id = auth.jwt() ->> 'sub'
    )
    AND (actor_user_id IS NULL OR actor_user_id = auth.jwt() ->> 'sub')
  );
