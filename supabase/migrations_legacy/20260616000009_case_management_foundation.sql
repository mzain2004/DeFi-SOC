CREATE TABLE IF NOT EXISTS security_cases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  severity TEXT NOT NULL DEFAULT 'medium',
  status TEXT NOT NULL DEFAULT 'open',
  assigned_to TEXT,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_at TIMESTAMPTZ,
  CONSTRAINT security_cases_status_check CHECK (status IN ('open', 'investigating', 'contained', 'resolved', 'closed')),
  CONSTRAINT security_cases_severity_check CHECK (severity IN ('low', 'medium', 'high', 'critical'))
);

CREATE INDEX IF NOT EXISTS idx_security_cases_org_created
  ON security_cases(org_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_security_cases_org_status
  ON security_cases(org_id, status);

CREATE INDEX IF NOT EXISTS idx_security_cases_org_severity
  ON security_cases(org_id, severity);

CREATE TABLE IF NOT EXISTS case_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID NOT NULL REFERENCES security_cases(id) ON DELETE CASCADE,
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  actor_user_id TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT case_events_type_check CHECK (event_type IN (
    'case_created',
    'alert_linked',
    'investigation_linked',
    'execution_linked',
    'note_added',
    'status_changed',
    'severity_changed'
  ))
);

CREATE INDEX IF NOT EXISTS idx_case_events_case_created
  ON case_events(case_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_case_events_org_created
  ON case_events(org_id, created_at DESC);

CREATE TABLE IF NOT EXISTS case_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID NOT NULL REFERENCES security_cases(id) ON DELETE CASCADE,
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  note TEXT NOT NULL,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_case_notes_case_created
  ON case_notes(case_id, created_at DESC);

CREATE TABLE IF NOT EXISTS case_alert_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID NOT NULL REFERENCES security_cases(id) ON DELETE CASCADE,
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  alert_id UUID NOT NULL REFERENCES alerts(id) ON DELETE CASCADE,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(case_id, alert_id)
);

CREATE INDEX IF NOT EXISTS idx_case_alert_links_case
  ON case_alert_links(case_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_case_alert_links_org_alert
  ON case_alert_links(org_id, alert_id);

CREATE TABLE IF NOT EXISTS case_investigation_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID NOT NULL REFERENCES security_cases(id) ON DELETE CASCADE,
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  investigation_id UUID NOT NULL REFERENCES alert_investigations(id) ON DELETE CASCADE,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(case_id, investigation_id)
);

CREATE INDEX IF NOT EXISTS idx_case_investigation_links_case
  ON case_investigation_links(case_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_case_investigation_links_org_investigation
  ON case_investigation_links(org_id, investigation_id);

CREATE TABLE IF NOT EXISTS case_execution_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID NOT NULL REFERENCES security_cases(id) ON DELETE CASCADE,
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  investigation_id UUID NOT NULL REFERENCES alert_investigations(id) ON DELETE CASCADE,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(case_id, investigation_id)
);

CREATE INDEX IF NOT EXISTS idx_case_execution_links_case
  ON case_execution_links(case_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_case_execution_links_org_investigation
  ON case_execution_links(org_id, investigation_id);

ALTER TABLE security_cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE case_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE case_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE case_alert_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE case_investigation_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE case_execution_links ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "org members can view security cases" ON security_cases;
CREATE POLICY "org members can view security cases" ON security_cases
  FOR SELECT TO authenticated
  USING (
    org_id IN (
      SELECT om.org_id
      FROM org_members om
      WHERE om.user_id = auth.jwt() ->> 'sub'
    )
  );

DROP POLICY IF EXISTS "org members can insert security cases" ON security_cases;
CREATE POLICY "org members can insert security cases" ON security_cases
  FOR INSERT TO authenticated
  WITH CHECK (
    org_id IN (
      SELECT om.org_id
      FROM org_members om
      WHERE om.user_id = auth.jwt() ->> 'sub'
    )
    AND (created_by IS NULL OR created_by = auth.jwt() ->> 'sub')
  );

DROP POLICY IF EXISTS "org members can update security cases" ON security_cases;
CREATE POLICY "org members can update security cases" ON security_cases
  FOR UPDATE TO authenticated
  USING (
    org_id IN (
      SELECT om.org_id
      FROM org_members om
      WHERE om.user_id = auth.jwt() ->> 'sub'
    )
  )
  WITH CHECK (
    org_id IN (
      SELECT om.org_id
      FROM org_members om
      WHERE om.user_id = auth.jwt() ->> 'sub'
    )
  );

DROP POLICY IF EXISTS "org members can view case events" ON case_events;
CREATE POLICY "org members can view case events" ON case_events
  FOR SELECT TO authenticated
  USING (
    org_id IN (
      SELECT om.org_id
      FROM org_members om
      WHERE om.user_id = auth.jwt() ->> 'sub'
    )
  );

DROP POLICY IF EXISTS "org members can insert case events" ON case_events;
CREATE POLICY "org members can insert case events" ON case_events
  FOR INSERT TO authenticated
  WITH CHECK (
    org_id IN (
      SELECT om.org_id
      FROM org_members om
      WHERE om.user_id = auth.jwt() ->> 'sub'
    )
    AND (actor_user_id IS NULL OR actor_user_id = auth.jwt() ->> 'sub')
  );

DROP POLICY IF EXISTS "org members can view case notes" ON case_notes;
CREATE POLICY "org members can view case notes" ON case_notes
  FOR SELECT TO authenticated
  USING (
    org_id IN (
      SELECT om.org_id
      FROM org_members om
      WHERE om.user_id = auth.jwt() ->> 'sub'
    )
  );

DROP POLICY IF EXISTS "org members can insert case notes" ON case_notes;
CREATE POLICY "org members can insert case notes" ON case_notes
  FOR INSERT TO authenticated
  WITH CHECK (
    org_id IN (
      SELECT om.org_id
      FROM org_members om
      WHERE om.user_id = auth.jwt() ->> 'sub'
    )
    AND (created_by IS NULL OR created_by = auth.jwt() ->> 'sub')
  );

DROP POLICY IF EXISTS "org members can update case notes" ON case_notes;
CREATE POLICY "org members can update case notes" ON case_notes
  FOR UPDATE TO authenticated
  USING (
    org_id IN (
      SELECT om.org_id
      FROM org_members om
      WHERE om.user_id = auth.jwt() ->> 'sub'
    )
  )
  WITH CHECK (
    org_id IN (
      SELECT om.org_id
      FROM org_members om
      WHERE om.user_id = auth.jwt() ->> 'sub'
    )
  );

DROP POLICY IF EXISTS "org members can view case alert links" ON case_alert_links;
CREATE POLICY "org members can view case alert links" ON case_alert_links
  FOR SELECT TO authenticated
  USING (
    org_id IN (
      SELECT om.org_id
      FROM org_members om
      WHERE om.user_id = auth.jwt() ->> 'sub'
    )
  );

DROP POLICY IF EXISTS "org members can insert case alert links" ON case_alert_links;
CREATE POLICY "org members can insert case alert links" ON case_alert_links
  FOR INSERT TO authenticated
  WITH CHECK (
    org_id IN (
      SELECT om.org_id
      FROM org_members om
      WHERE om.user_id = auth.jwt() ->> 'sub'
    )
    AND (created_by IS NULL OR created_by = auth.jwt() ->> 'sub')
  );

DROP POLICY IF EXISTS "org members can view case investigation links" ON case_investigation_links;
CREATE POLICY "org members can view case investigation links" ON case_investigation_links
  FOR SELECT TO authenticated
  USING (
    org_id IN (
      SELECT om.org_id
      FROM org_members om
      WHERE om.user_id = auth.jwt() ->> 'sub'
    )
  );

DROP POLICY IF EXISTS "org members can insert case investigation links" ON case_investigation_links;
CREATE POLICY "org members can insert case investigation links" ON case_investigation_links
  FOR INSERT TO authenticated
  WITH CHECK (
    org_id IN (
      SELECT om.org_id
      FROM org_members om
      WHERE om.user_id = auth.jwt() ->> 'sub'
    )
    AND (created_by IS NULL OR created_by = auth.jwt() ->> 'sub')
  );

DROP POLICY IF EXISTS "org members can view case execution links" ON case_execution_links;
CREATE POLICY "org members can view case execution links" ON case_execution_links
  FOR SELECT TO authenticated
  USING (
    org_id IN (
      SELECT om.org_id
      FROM org_members om
      WHERE om.user_id = auth.jwt() ->> 'sub'
    )
  );

DROP POLICY IF EXISTS "org members can insert case execution links" ON case_execution_links;
CREATE POLICY "org members can insert case execution links" ON case_execution_links
  FOR INSERT TO authenticated
  WITH CHECK (
    org_id IN (
      SELECT om.org_id
      FROM org_members om
      WHERE om.user_id = auth.jwt() ->> 'sub'
    )
    AND (created_by IS NULL OR created_by = auth.jwt() ->> 'sub')
  );
