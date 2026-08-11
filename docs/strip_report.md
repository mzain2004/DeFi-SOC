# Step 2: Strip Report — PhishSlayer-V2 Remnants & DeFi SOC Placeholders

This report outlines all SOC-specific (Wazuh/MSSP/SIEM) code elements identified across the files copied in Step 1, specifies exact line ranges requiring modification, and details the replacement DeFi SOC UI components.

---

## 1. Code Removal & Replacement Inventory

### File: `app/app/dashboard/MissionControl.tsx`
* **Lines 11–18**: `Agent` interface defining Wazuh endpoint fields (`ip`, `os`, `lastKeepAlive`).
  * **Replacement**: `ChainNode` interface defining EVM Node/RPC health fields (`chainId`, `rpcEndpoint`, `blockHeight`, `latencyMs`, `status`).
* **Lines 33–36**: Wazuh & ATT&CK alert interface fields (`mitre_techniques`, `blast_radius`: `'user' | 'device' | 'org' | 'tenant'`).
  * **Replacement**: DeFi incident fields (`invariant_violations: string[]`, `tvl_at_risk_usd: number`, `affected_contracts: string[]`, `trace_id: string`).
* **Lines 44–50, 55**: STIX 2.1 Diamond Model state (`adversary`, `victim`, `infrastructure`, `capability`) and generic endpoint `blast_radius`.
  * **Replacement**: EVM Threat Model (`attacker_address`, `target_vault`, `call_depth`, `reentrancy_detected`).
* **Lines 103–122, 144–148, 150–167**: `fetchAgents` polling `/api/agents` and `formatLastSeen` for Wazuh agent keepalives.
  * **Replacement**: RPC Provider health status check (`fetchNodeStatus`) polling EVM node latency and synced block numbers.
* **Lines 473–514**: "Mapped Endpoints" sidebar listing connected Wazuh SIEM agents.
  * **Replacement**: **DeFi Protocol Vault / Contract Monitoring Rail** displaying monitored protocol pools, vault addresses, and RPC node status.
* **Lines 678–759**: "L1 AGENT TRIAGE RESULTS" and endpoint containment policy panel.
  * **Replacement**: **∆TVL Impact & Anomaly Detector Panel** featuring live ∆TVL charts, unexpected withdrawal spike indicators, and flashloan anomaly scores.
* **Lines 760–794**: "MITRE ATT&CK TECHNIQUES MAPPED" card with enterprise attack IDs (`T1078`, `T1110`, `T1059`, etc.).
  * **Replacement**: **EVM Fork Trace Viewer & Call Stack Inspector** visualizing simulated transaction execution traces, sub-call stack tree, state overrides, and reentrancy check status.
* **Lines 795–826**: "THREAT INTEL ENRICHMENT" panel for IP Abuse scores and malware feed hits.
  * **Replacement**: **DeFi Threat Intel Panel** displaying OFAC address screening, Tornado Cash taint percentage, and deployer address reputation.
* **Lines 858–1003**: "HUMAN APPROVAL RAIL" with endpoint isolation action buttons and legacy countdown timers.
  * **Replacement**: **Session-Key Approval Rail & Multisig Execution Stream** managing EIP-712 session-key signatures, emergency pause tx generation, and timelock queue approval status.

### File: `app/app/dashboard/page.tsx`
* **Line 46**: Hardcoded webhook URL string `https://phishslayer.tech/api/webhooks/${orgId}`.
  * **Replacement**: `https://defisoc.io/api/webhooks/${orgId}`.
* **Lines 63–67**: Sanitization of Wazuh-specific alert attributes (`mitre_techniques`, `blast_radius`).
  * **Replacement**: Sanitization of EVM trace attributes (`invariant_violations`, `tvl_at_risk_usd`, `trace_id`).

### File: `app/app/dashboard/WebhookSection.tsx`
* **Line 18**: Heading `"Wazuh Webhook URL"`.
  * **Replacement**: `"DeFi SOC Event & RPC Telemetry Webhook"`.

### File: `app/app/onboarding/OnboardingForm.tsx`
* **Line 53**: Input placeholder `"Security Operations Team"`.
  * **Replacement**: `"DeFi Protocol Operations Team"`.

### File: `app/app/onboarding/page.tsx`
* **Lines 55, 61**: Text referencing `"PhishSlayer organization workspace"` and `"Review alert evidence before containment"`.
  * **Replacement**: `"DeFi SOC Protocol Workspace"` and `"Review EVM traces & invariant violations before pause"`.

### File: `app/app/layout.tsx`
* **Lines 7–8**: Metadata title `"PhishSlayer"` and description `"Agent-assisted SOC prototype for MSSPs"`.
  * **Replacement**: Title `"Defi Soc"` and description `"DeFi Security Operations Center & Automated Invariant Sentinel"`.

### Files: `app/app/sign-in/[[...sign-in]]/page.tsx` & `app/app/sign-up/[[...sign-up]]/page.tsx`
* **Lines 20–24 (Sign In)** & **Lines 20–24 (Sign Up)**: Headers and descriptions referencing `"PhishSlayer"`.
  * **Replacement**: `"Sign in to Defi Soc"` / `"Create your Defi Soc account"`.

---

## 2. Preserved System Foundations (Untouched)

The following core architectural pillars will remain untouched during the stripping process:

1. **Design Tokens & Theme System**:
   * All CSS custom properties and color tokens in `app/app/globals.css` (e.g., `#080D12` void background, `#0D1117` surface, `#7C5CFF` accent, `#EF4444` danger, `#10B981` success).
2. **Layout Shell**:
   * The responsive 3-column "Zero-Page" grid in `MissionControl.tsx` (Feed Sidebar, Center Inspector Canvas, Right Approval Rail).
3. **Clerk Authentication**:
   * `ClerkProvider` wrapper in `layout.tsx`, `clerkMiddleware` in `middleware.ts`, and sign-in / sign-up route handling.
4. **Polar Billing & Subscription Structure**:
   * Plan limits (`free`, `soc_pro`, `command_center`, `enterprise`) in `/api/billing` and database schema metadata.
5. **Multi-Tenant Supabase RLS Pattern**:
   * Database Row Level Security patterns filtering all data access by `org_id` context (`resolveActiveOrg`, service role client initialization).
