CREATE TABLE alert_investigations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    alert_id UUID NOT NULL REFERENCES alerts(id) ON DELETE CASCADE,
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    opplan JSONB NOT NULL DEFAULT '[]',
    diamond_model JSONB NOT NULL DEFAULT '{}',
    proposed_actions JSONB NOT NULL DEFAULT '[]',
    critic_review TEXT,
    confidence FLOAT,
    status TEXT NOT NULL DEFAULT 'pending_approval',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_investigations_alert_id ON alert_investigations(alert_id);
CREATE INDEX idx_investigations_org_id ON alert_investigations(org_id);

ALTER TABLE alert_investigations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org members can view investigations"
    ON alert_investigations FOR ALL
    USING (
        org_id IN (
            SELECT id FROM organizations
            WHERE owner_id = auth.jwt() ->> 'sub'
        )
    );

ALTER PUBLICATION supabase_realtime ADD TABLE alert_investigations;
