CREATE TABLE IF NOT EXISTS pending_verdicts (
    nonce TEXT PRIMARY KEY,
    alert_id UUID NOT NULL,
    org_id UUID NOT NULL,
    status TEXT NOT NULL,
    verdict_json JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL
);
