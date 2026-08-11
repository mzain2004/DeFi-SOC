CREATE TABLE IF NOT EXISTS alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  raw_payload JSONB NOT NULL,
  rule_id TEXT,
  rule_level INTEGER,
  rule_description TEXT,
  agent_id TEXT,
  agent_name TEXT,
  status TEXT DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users see alerts for own org" ON alerts
  FOR SELECT USING (
    org_id IN (
      SELECT org_id FROM org_members WHERE user_id = auth.jwt() ->> 'sub'
    )
  );
