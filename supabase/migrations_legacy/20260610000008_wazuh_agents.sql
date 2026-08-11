CREATE TABLE IF NOT EXISTS public.wazuh_agents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  wazuh_agent_id TEXT NOT NULL,
  wazuh_agent_name TEXT,
  status TEXT,
  ip_address TEXT,
  os_name TEXT,
  manager BOOLEAN NOT NULL DEFAULT false,
  active_response_eligible BOOLEAN NOT NULL DEFAULT false,
  last_seen TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(org_id, wazuh_agent_id)
);

CREATE INDEX IF NOT EXISTS idx_wazuh_agents_org_id
  ON public.wazuh_agents(org_id);

CREATE INDEX IF NOT EXISTS idx_wazuh_agents_org_agent
  ON public.wazuh_agents(org_id, wazuh_agent_id);

CREATE INDEX IF NOT EXISTS idx_wazuh_agents_org_eligible
  ON public.wazuh_agents(org_id, active_response_eligible);

CREATE INDEX IF NOT EXISTS idx_wazuh_agents_org_status
  ON public.wazuh_agents(org_id, status);

ALTER TABLE public.wazuh_agents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "org members can view mapped Wazuh agents" ON public.wazuh_agents;
CREATE POLICY "org members can view mapped Wazuh agents"
  ON public.wazuh_agents
  FOR SELECT
  TO authenticated
  USING (
    org_id IN (
      SELECT om.org_id
      FROM public.org_members om
      WHERE om.user_id = ((SELECT auth.jwt()) ->> 'sub')
    )
  );

REVOKE ALL ON public.wazuh_agents FROM anon;
REVOKE ALL ON public.wazuh_agents FROM public;
GRANT SELECT ON public.wazuh_agents TO authenticated;
