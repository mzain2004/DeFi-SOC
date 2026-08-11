# Step 3: Aegis Architectural Patterns — Extraction Reference

This document extracts core zero-trust proxy design patterns from `D:\Aegis` for reference in future Rust/TypeScript reimplementations. **No code from Aegis is copied verbatim.**

---

## 1. HMAC / Nonce / Fingerprint Scheme

The Aegis cryptographic verification scheme guarantees that pending execution requests cannot be tampered with between suspension, operator approval, and execution.

### Field Definitions & Wire Format

* **`approval_id`** (`string`): Unique identifier for the pending approval request (UUIDv4 or string prefixed with `auto-`).
* **`nonce`** (`string`): Single-use UUIDv4 string generated upon request interception.
* **`payload_hash`** (`string`): Lowercase 64-character SHA-256 hex digest of the raw request payload bytes.
* **`secret`** (`string`): Shared HMAC secret key configured in settings (`shared_hmac_secret`).
* **`signature`** (`string`): Lowercase 64-character HMAC-SHA256 hex digest.

### Wire Signature Message Format

The message payload to be signed is constructed by concatenating `approval_id`, `nonce`, and `payload_hash` using colon (`:`) delimiters:

```text
message_string = approval_id + ":" + nonce + ":" + payload_hash
```

### Verification Pseudocode

```text
function ComputePayloadHash(raw_bytes):
    return sha256_hex(raw_bytes)

function ComputeHMAC(approval_id, nonce, payload_hash, secret):
    message = format("{}:{}:{}", approval_id, nonce, payload_hash)
    return hmac_sha256_hex(key=secret, msg=message)

function VerifySignature(approval_id, nonce, payload_hash, secret, signature):
    expected_sig = ComputeHMAC(approval_id, nonce, payload_hash, secret)
    return constant_time_compare(expected_sig, signature)
```

---

## 2. Atomic Pending-Store SQL Pattern

To prevent race conditions, double approval, and replay attacks, status transitions use single-statement optimistic locking in PostgreSQL / SQLite.

### State Machine Lifecycle
`pending` ➔ `approved` ➔ `executing` ➔ `completed` / `failed` / `expired`

### Optimistic Lock SQL Update (`claim_for_approval`)

```sql
UPDATE pending_requests
SET status = 'approved',
    approved_at = :current_timestamp,
    approved_by = :operator_username
WHERE nonce = :nonce
  AND status = 'pending';
```

### WHERE Clause Logic & Race Prevention
* The `WHERE` clause strictly requires `nonce = :nonce AND status = 'pending'`.
* **Atomic Return Check**: If `affected_rows == 0`, the transaction fails safely. The application then checks:
  1. If record does not exist ➔ Return `not_found`.
  2. If `status IN ('completed', 'failed', 'archived')` ➔ Return `already_processed`.
  3. If `expires_at <= current_timestamp` ➔ Transition status to `expired` and return `expired`.

### Subsequent State Transitions

```sql
-- Transition: APPROVED -> EXECUTING
UPDATE pending_requests
SET status = 'executing'
WHERE nonce = :nonce AND status = 'approved';

-- Transition: EXECUTING -> COMPLETED
UPDATE pending_requests
SET status = 'completed', completed_at = :current_timestamp
WHERE nonce = :nonce AND status = 'executing';
```

---

## 3. READ_ONLY vs. MUTATING Tool Classification

Requests are inspected and classified before execution based on their JSON-RPC tool name.

### Decision Matrix

| Tool Name | Classification | Requires Human Approval | Fail-Safe Default Behavior |
| :--- | :--- | :--- | :--- |
| `kubectl_get` | `READ_ONLY` | No (Pass-through) | Immediate Execution |
| `kubectl_describe` | `READ_ONLY` | No (Pass-through) | Immediate Execution |
| `kubectl_logs` | `READ_ONLY` | No (Pass-through) | Immediate Execution |
| `kubectl_top` | `READ_ONLY` | No (Pass-through) | Immediate Execution |
| `kubectl_events` | `READ_ONLY` | No (Pass-through) | Immediate Execution |
| `kubectl_apply` | `MUTATING` | **Yes (Suspend)** | Hold in Pending Store |
| `kubectl_create` | `MUTATING` | **Yes (Suspend)** | Hold in Pending Store |
| `kubectl_delete` | `MUTATING` | **Yes (Suspend)** | Hold in Pending Store |
| `kubectl_patch` | `MUTATING` | **Yes (Suspend)** | Hold in Pending Store |
| `kubectl_replace` | `MUTATING` | **Yes (Suspend)** | Hold in Pending Store |
| `kubectl_scale` | `MUTATING` | **Yes (Suspend)** | Hold in Pending Store |
| *Unrecognized Tool* | `UNKNOWN` | **Yes (Suspend)** | **Fail-Closed (Require Approval)** |
| *Malformed JSON* | `UNKNOWN` | **Yes (Suspend)** | **Fail-Closed (Require Approval)** |

### Classification Pseudocode

```text
enum OperationType {
    READ_ONLY,
    MUTATING,
    UNKNOWN
}

function ClassifyRequest(json_payload_bytes):
    parse_result = parse_json_rpc(json_payload_bytes)
    if parse_result is invalid or method != "tools/call":
        return OperationType.UNKNOWN

    tool_name = parse_result.params.name
    if tool_name in READ_ONLY_SET:
        return OperationType.READ_ONLY
    else if tool_name in MUTATING_SET:
        return OperationType.MUTATING
    else:
        return OperationType.UNKNOWN
```

---

## 4. BPF-LSM Audit Reader & Correlation Logic

The audit reader tails an out-of-process, eBPF-generated plaintext kernel log stream to correlate system-level process execution and network connections with approved requests.

### Log Line Format

Lines are space-padded key-value tokens prefixed with an event marker:

```text
[BLOCK] EXEC cgid=789 tgid=123 pid=456 uid=0 comm=curl target=/usr/bin/curl
[AUDIT] CONN cgid=789 tgid=123 pid=456 uid=0 comm=curl dst=93.184.216.34:443
```

### Token Parsing Pseudocode

```text
function ParseAuditLine(line_string):
    tokens = split_whitespace(line_string.trim())
    if length(tokens) < 3:
        return null

    marker = tokens[0]
    if marker == "[BLOCK]":
        blocked = true
    else if marker == "[AUDIT]":
        blocked = false
    else:
        return null  // Ignore non-matching log lines

    kind = tokens[1]  // e.g. "EXEC", "CONN"
    fields = parse_key_value_pairs(tokens[2..])

    if "cgid" not in fields:
        return null

    return AuditEvent(
        kind = kind,
        blocked = blocked,
        comm = fields.get("comm", ""),
        cgid = parse_int(fields["cgid"]),
        target = fields.get("target", null),
        dst = fields.get("dst", null)
    )
```

### Log File Tailing & Rotation Resilience Logic

* **Byte Offset Tracking**: The reader stores the last read byte offset (`offset`).
* **Rotation & Truncation Handling**:
  ```text
  file_size = stat(log_file_path).st_size
  if offset > file_size:
      offset = 0  // File was rotated or truncated, reset offset to start
  ```
* **Non-Blocking Read Guarantee**: If the log file is temporarily inaccessible or missing (`OSError`), the reader returns `([], 0)` rather than raising an exception. Kernel enforcement operates independently out-of-band.
