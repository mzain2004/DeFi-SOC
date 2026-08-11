# Audit Findings — Verification of Architecture Docs vs Source Code

This document contains the audit results verifying `docs/aegis_patterns.md` and `docs/strip_report.md` against authoritative source code files in `D:\Aegis` and `D:\Defi Soc\app\`.

---

## 1. Audit of `docs/aegis_patterns.md` vs `D:\Aegis`

### Section 1: HMAC / Nonce / Fingerprint Scheme (`app/crypto.py`)
* **Status**: **NO MISMATCH**
* **Verification**:
  * Field names (`approval_id`, `nonce`, `payload_hash`, `secret`, `signature`) match `app/crypto.py` lines 36–66.
  * Message format `approval_id:nonce:payload_hash` matches `f"{approval_id}:{nonce}:{payload_hash}"` in `compute_hmac()` at line 61.
  * SHA-256 hex payload hashing and constant-time verification logic (`hmac.compare_digest`) match lines 10–27.

### Section 2: Atomic Pending-Store SQL Pattern (`app/pending_store.py`)
* **Status**: **NO MISMATCH**
* **Verification**:
  * Optimistic locking update statement in `claim_for_approval()` matches lines 252–263 (`PendingRequestModel.nonce == nonce`, `PendingRequestModel.status == "pending"`).
  * State transitions (`pending` ➔ `approved` ➔ `executing` ➔ `completed`/`failed`/`expired`) match lines 248, 325, 354, 384.
  * Affected row count check (`rowcount == 0`) and fallback classification logic match lines 265–282.

### Section 3: Tool Policy & Decision Matrix (`app/tool_policy.py` & `app/rpc_parser.py`)
* **Status**: **NO MISMATCH**
* **Verification**:
  * All 5 read-only tools (`kubectl_get`, `kubectl_describe`, `kubectl_logs`, `kubectl_top`, `kubectl_events`) match `READ_ONLY_TOOLS` in `app/tool_policy.py` lines 5–13.
  * All 6 mutating tools (`kubectl_apply`, `kubectl_create`, `kubectl_delete`, `kubectl_patch`, `kubectl_replace`, `kubectl_scale`) match `MUTATING_TOOLS` in `app/tool_policy.py` lines 15–24.
  * JSON-RPC classification and fail-closed `UNKNOWN` mapping match `parse_mcp_request()` in `app/rpc_parser.py` lines 27–65.

### Section 4: BPF-LSM Audit Reader (`app/execution/failsafe_audit.py`)
* **Status**: **NO MISMATCH**
* **Verification**:
  * Log markers `[BLOCK]` and `[AUDIT]` match lines 21–22 and line parsing in lines 52–57.
  * Token parsing, integer `cgid` extraction, and mandatory `target`/`dst` checks match lines 47–86.
  * File rotation handling (`offset > size ➔ offset = 0`) and non-blocking `OSError` fallback match lines 118–134.

---

## 2. Audit of `docs/strip_report.md` vs `D:\Defi Soc\app\`

### Cited File & Line Range Verification
* **Status**: **NO MISMATCH**
* **Verification**:
  1. `app/app/dashboard/MissionControl.tsx`:
     * Lines 11–18: `Agent` interface (`ip`, `os`, `lastKeepAlive`) — Verified.
     * Lines 33–36: `mitre_techniques` & `blast_radius` fields — Verified.
     * Lines 44–50, 55: `diamond_model` & endpoint `blast_radius` — Verified.
     * Lines 103–122, 144–148, 150–167: `fetchAgents`, agent interval, `formatLastSeen` — Verified.
     * Lines 473–514: "Mapped Endpoints" sidebar — Verified.
     * Lines 678–759: "L1 AGENT TRIAGE RESULTS" panel — Verified.
     * Lines 760–794: "MITRE ATT&CK TECHNIQUES MAPPED" card — Verified.
     * Lines 795–826: "THREAT INTEL ENRICHMENT" card — Verified.
     * Lines 858–1003: "HUMAN APPROVAL RAIL" & legacy countdowns — Verified.
  2. `app/app/dashboard/page.tsx`:
     * Line 46: `phishslayer.tech` webhook URL string — Verified.
     * Lines 63–67: Sanitization of `mitre_techniques` & `blast_radius` — Verified.
  3. `app/app/dashboard/WebhookSection.tsx`:
     * Line 18: `"Wazuh Webhook URL"` header — Verified.
  4. `app/app/onboarding/OnboardingForm.tsx`:
     * Line 53: Placeholder `"Security Operations Team"` — Verified.
  5. `app/app/onboarding/page.tsx`:
     * Lines 55, 61: `"PhishSlayer organization workspace"` text — Verified.
  6. `app/app/layout.tsx`:
     * Lines 7–8: Metadata title `"PhishSlayer"` — Verified.
  7. `app/app/sign-in/[[...sign-in]]/page.tsx` & `app/app/sign-up/[[...sign-up]]/page.tsx`:
     * Lines 20–24: `"Sign in to PhishSlayer"` headers — Verified.

---

## 3. Discrepancies & Drift Flagged

### Flagged Item: Legacy MSSP Billing Tier Names in `strip_report.md`
* **Location in Document**: `docs/strip_report.md`, Section 2 ("Preserved System Foundations"), Item 4.
* **Source Code Reference**: `app/app/api/billing/route.ts`, lines 17–25:
  ```typescript
  function planLimit(plan: string): number {
    switch (plan) {
      case "free":
        return 50;
      case "soc_pro":
      case "command_center":
      case "enterprise":
        return -1;
      default:
        return 50;
    }
  }
  ```
* **Issue**: `strip_report.md` listed `free`, `soc_pro`, `command_center`, and `enterprise` as "preserved/untouched". These are legacy MSSP / SIEM tier names carried over from PhishSlayer-V2.
* **Required Action (Phase 3 Billing Work)**:
  During Phase 3 billing refactoring, these plan identifiers must be replaced with DeFi SOC protocol tiers:
  1. `free` / `testnet` (Free / Testnet Sandbox)
  2. `protocol_standard` (Protocol Standard — $2,500/month)
  3. `ecosystem` (Ecosystem / Multi-Vault — $6,000+/month)
