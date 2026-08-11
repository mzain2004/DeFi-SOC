ALTER TABLE org_members
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

UPDATE org_members om
SET role = 'owner',
    updated_at = now()
FROM organizations o
WHERE o.id = om.org_id
  AND o.owner_id = om.user_id
  AND om.role = 'admin';

UPDATE org_members
SET role = 'analyst_l2',
    updated_at = now()
WHERE role = 'analyst';

ALTER TABLE org_members
  ALTER COLUMN role SET DEFAULT 'viewer';

ALTER TABLE org_members
  DROP CONSTRAINT IF EXISTS org_members_role_check;

ALTER TABLE org_members
  ADD CONSTRAINT org_members_role_check CHECK (
    role IN ('owner', 'admin', 'analyst_l3', 'analyst_l2', 'analyst_l1', 'viewer')
  );

CREATE INDEX IF NOT EXISTS idx_org_members_org_role
  ON org_members(org_id, role);
