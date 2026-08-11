# Aegis / VetoOps System Architecture & Technical Specification

> **System Overview:** Aegis / VetoOps is a transparent, zero-trust approval proxy and autonomous agent control plane. It sits between AI Model Context Protocol (MCP) clients and infrastructure tools to inspect, classify, suspend, and gate high-impact mutating actions until out-of-band human HMAC authorization is granted.

---

## 📌 1. Overview of Aegis / VetoOps System & Objectives

### 1.1 Problem Statement
Autonomous AI agents powered by modern Large Language Models (e.g., Qwen 3.7-Max, Claude, GPT-4) can directly execute operational commands against live infrastructure via standard tool-calling frameworks like the Model Context Protocol (MCP). Direct, un-gated execution presents high risk:
* **Ambiguous or Compromised Intent:** Prompt injection, model hallucinations, or ambiguous diagnostic alerts can lead an agent to generate destructive commands (e.g., `kubectl delete`, `kubectl scale --replicas=0`).
* **Lack of Audit Lineage:** Direct execution leaves no independent, cryptographically attested record of what exact payload the agent requested versus what was approved and executed.
* **Silent Payload Rewriting:** Traditional security gateways often attempt to mutate or sanitize requests in flight, breaking signature integrity and obscuring original agent intent.

### 1.2 Purpose & Core Mission
Aegis / VetoOps provides a **transparent, byte-preserving execution gateway** and **SRE agent orchestration framework**. It acts as an inline proxy that intercepts MCP JSON-RPC requests from AI agents before they reach upstream infrastructure tools (e.g., Kubernetes MCP servers). 

```
+------------------+         JSON-RPC          +--------------------+         Read-Only Pass-Through        +----------------------+
|  Qwen SRE Agent  | ------------------------> |  VetoOps Proxy     | ------------------------------------> | Upstream K8s Server  |
|  (Responses API) |                           |  (FastAPI Gateway) |                                       +----------------------+
+------------------+                           +--------------------+                                                  ^
         ^                                               | Mutating Request                                            | Approved
         | HTTP 202 (Pending Nonce)                      v Intercept & Suspend                                         | Payload
         +------------------------------------- +--------------------+        POST /approve/ (HMAC + Nonce)    | Execution
                                                | Pending Store (DB) | <---------------------------------------+
                                                +--------------------+        Human Operator / Control Panel
```

### 1.3 System Design Principles
1. **Default-Deny / Mutation Suspension:** Read-only requests (`kubectl_get`, `kubectl_describe`, `kubectl_logs`, `kubectl_top`, `kubectl_events`) are forwarded transparently. Mutating requests (`kubectl_apply`, `kubectl_create`, `kubectl_delete`, `kubectl_patch`, `kubectl_replace`, `kubectl_scale`) are intercepted, suspended, fingerprinted, and held for human review.
2. **Byte-Preserving Transparency:** Raw request payload bytes are captured and saved without modification. Upon human release, the *exact* original byte stream is delivered to the upstream server.
3. **Cryptographic Attestation & Replay Protection:** Suspended requests receive a SHA-256 fingerprint, a UUID4 nonce, an `approval_id`, and a strict Time-To-Live (TTL). Approval requires an HMAC-SHA256 signature calculated over `approval_id:nonce:payload_hash`.
4. **Atomic State Machine:** Transitions from `PENDING` -> `APPROVED` -> `EXECUTING` -> `COMPLETED` / `FAILED` are guarded by database-level optimistic locking, eliminating double-execution race conditions.
5. **Multi-Layered Defense:** Integrates Role-Based Access Control (RBAC), immutable audit logging, and an optional BPF-LSM OS kernel security floor (`FailsafeCorrelatingExecutor`) to detect out-of-band kernel syscall violations during execution windows.

---

## 🏗️ 2. Core Technology Stack

| Layer / Subsystem | Technologies & Libraries | Architectural Purpose |
| :--- | :--- | :--- |
| **Language Runtime** | Python 3.12, AsyncIO | Core application runtime providing high-concurrency non-blocking I/O. |
| **API Proxy Gateway** | FastAPI, Uvicorn, HTTPX | Transparent HTTP reverse-proxy handling JSON-RPC interception, route handling, and upstream forwarding. |
| **LLM & Agent Framework** | Qwen 3.7-Max (`qwen3.7-max`), OpenAI Python SDK (`AsyncOpenAI`) | Autonomous SRE agent loop integrated with Alibaba Cloud Model Studio / DashScope Responses API using context-chaining. |
| **LLM Extensions** | `preserve_thinking=True`, `x-dashscope-session-cache=enable` | Extended thinking chain retention and DashScope prompt caching optimization. |
| **Data Validation & Settings**| Pydantic v2, Pydantic Settings | Strictly validated environment configuration (`AgentSettings`, `Settings`) and JSON-RPC data models. |
| **Persistence & Database** | SQLite (`aegis.db`), SQLAlchemy ORM, Alembic | Persistent storage of pending requests, approval decisions, execution logs, operator accounts, and audit events. |
| **Security & Cryptography** | HMAC-SHA256, SHA-256, UUID4, Passlib/Bcrypt | Cryptographic request hashing, nonce generation, HMAC signature verification, and API key hashing. |
| **Kernel Security Floor** | BPF-LSM Linux Kernel Audit Stream, Cgroups | Out-of-band OS kernel security enforcement via cgroup-scoped syscall block event correlation (`FailsafeAuditReader`). |
| **Observability & Metrics** | `structlog`, OpenTelemetry Tracing, Prometheus Client | Structured JSON logging with correlation IDs (`X-Correlation-ID`), Prometheus metrics exposition (`/metrics`), and latency gauges. |
| **Web Control Room** | React, Vite, HTML5, CSS3 | Embedded SPA served at `/dashboard` providing real-time operational monitoring, pending approvals review, execution history, and audit log analysis. |

---

## 🧠 3. Autonomous Execution Engine

### 3.1 Agent Loop Architecture (`agent/loop.py`)
The VetoOps SRE Agent (`VetoOpsAgent`) operates as an autonomous single-agent loop against the Qwen 3.7-Max Responses API (`https://dashscope-intl.aliyuncs.com/compatible-mode/v1`). 

```
                                 +------------------------------+
                                 |  Incident Alert Input        |
                                 +------------------------------+
                                                |
                                                v
                             +--------------------------------------+
                             |  System Instructions + Alert Context |
                             +--------------------------------------+
                                                |
                                                v
                                 +------------------------------+
                                 | Qwen 3.7-Max Responses API   | <---+
                                 +------------------------------+     |
                                                |                     |
                                      Function Call Generated         | Turn Loop
                                                v                     | Context-Chaining
                                 +------------------------------+     | (previous_response_id)
                                 | VetoProxyBridge / MCP Proxy  |     |
                                 +------------------------------+     |
                                                |                     |
                                      Tool Execution Result           |
                                                v                     |
                                 +------------------------------+     |
                                 | Function Call Output Payload | ----+
                                 +------------------------------+
```

1. **Context-Chaining Loop:** Each iteration sends the user prompt or tool results to `client.responses.create(...)`. Context continuity is maintained across turns using `previous_response_id`.
2. **Tool Modes:**
   * `bridge` (Default): Local HTTP bridge (`VetoProxyBridge`) that formats tool invocations as standard MCP JSON-RPC `tools/call` bodies and POSTs them to the VetoOps proxy.
   * `remote_mcp`: Remote MCP server-side execution via SSE endpoint (`VETO_MCP_SSE_URL`).

### 3.2 Operating Rules & System Prompts (`agent/prompts.py`)
The agent system instructions strictly dictate operational constraints:
1. **Read-First Protocol:** The agent MUST investigate with read-only tools (`kubectl_get`, `kubectl_describe`, `kubectl_logs`, `kubectl_top`, `kubectl_events`) to establish root cause before proposing changes.
2. **Minimal Remediation:** When a fix requires a mutating tool (`kubectl_apply`, `kubectl_create`, `kubectl_delete`, `kubectl_patch`, `kubectl_replace`, `kubectl_scale`), the agent proposes the minimal patch and invokes the tool.
3. **Suspension & Nonce Awareness:** When VetoOps returns an HTTP `202 Accepted` response (`status: "pending_approval"`), the agent recognizes that the action is suspended waiting for out-of-band human review.
4. **Anti-Spam / Anti-Replay Constraint:** The agent is explicitly forbidden from repeatedly issuing identical mutating calls in a tight loop. It pauses, reports the `nonce` and `approval_id` to the operator, and waits.
5. **Timeout / Expiry Self-Correction:** If approval times out or is rejected, the agent halts mutation attempts, summarizes the blocked action and risk, lists safe read-only follow-ups, and requests operator guidance.

### 3.3 Execution Loop State Machine
```
[Agent Start] --> [Read-Only Diagnostics] --> [Root Cause Identified]
                                                      |
                                                      v
                                           [Mutating Tool Invoked]
                                                      |
                                                      v
                                        [VetoOps Intercept (HTTP 202)]
                                                      |
                                       +--------------+--------------+
                                       |                             |
                            [Human Approves Out-of-Band]     [Timeout / Rejected]
                                       |                             |
                                       v                             v
                           [Upstream Execution (200)]      [Agent Halts Mutation]
                                       |                             |
                                       v                             v
                           [Verify Recovery (Reads)]       [Report Risk & Next Steps]
```

---

## 🔐 4. Security, Policy & Safety Controls

### 4.1 Request Interception & Classification (`app/rpc_parser.py`, `app/tool_policy.py`)
Incoming requests to `POST /` are read into memory as raw byte arrays. `parse_mcp_request(body)` inspects a decoded copy without altering the byte payload:
* **JSON-RPC Extraction:** Extracts `jsonrpc`, `id`, `method`, and `params.name`.
* **Tool Classification:**
  * **READ_ONLY:** `{"kubectl_get", "kubectl_describe", "kubectl_logs", "kubectl_top", "kubectl_events"}`
  * **MUTATING:** `{"kubectl_apply", "kubectl_create", "kubectl_delete", "kubectl_patch", "kubectl_replace", "kubectl_scale"}`
  * **UNKNOWN:** Unparsed payloads or unrecognized tool names fail-safe to `UNKNOWN`.

### 4.2 Cryptographic Execution Guard (`app/crypto.py`)
* **Payload Hash:** `payload_hash = compute_sha256(raw_bytes)` ensures exact content integrity.
* **Nonce & Approval ID:** `nonce = generate_nonce()` (UUID4) and `approval_id = generate_nonce()` (UUID4) guarantee uniqueness.
* **HMAC Signature Verification:** Approvals support optional or required HMAC-SHA256 signature verification computed over:
  $$\text{HMAC\_Message} = \text{approval\_id} \mathbin{:} \text{nonce} \mathbin{:} \text{payload\_hash}$$
  Verified using constant-time string comparison (`hmac.compare_digest`).

### 4.3 Authentication & Role-Based Access Control (RBAC) (`app/auth_models.py`, `app/dependencies.py`)
VetoOps enforces API Key authentication (`Authorization: Api-Key <key>`) mapped to persistent `OperatorModel` database records with three explicit roles:

```
                  +-----------------------------------------------------+
                  |                   User Roles                        |
                  +-------------------+------------------+--------------+
                  |  VIEWER           |  APPROVER        | ADMIN        |
+-----------------+-------------------+------------------+--------------+
| VIEW_PENDING    |         X         |        X         |      X       |
| VIEW_HISTORY    |         X         |        X         |      X       |
| VIEW_AUDIT      |         X         |        X         |      X       |
| VIEW_METRICS    |         X         |        X         |      X       |
| APPROVE_REQUEST |                   |        X         |      X       |
| EXECUTE_REQUEST |                   |                  |      X       |
| MANAGE_USERS    |                   |                  |      X       |
| MANAGE_SYSTEM   |                   |                  |      X       |
+-----------------+-------------------+------------------+--------------+
```

### 4.4 Kernel-Level Safety Floor (`app/execution/failsafe_executor.py`, `app/execution/failsafe_audit.py`)
To prevent unauthorized out-of-band container escapes or illegal syscalls during approved execution, Aegis integrates a BPF-LSM (eBPF Linux Security Module) audit reader:
* The `FailsafeCorrelatingExecutor` wraps the standard `KubernetesExecutor`.
* Before dispatch, it records the byte offset in `/var/log/failsafe-audit.log`.
* Following dispatch, it checks for kernel block events (`event.blocked == True`) linked to the target `cgid` (cgroup ID).
* If a kernel block is observed and `FAILSAFE_FAIL_ON_BLOCK=True`, the response status is overridden to HTTP `502 Bad Gateway` (`x-veto-failsafe-blocks: >0`).

---

## 🔄 5. Workflow & State Management

### 5.1 Request Lifecycle & State Graph (`app/models.py`, `app/pending_store.py`)

```
                 +-----------------------------------+
                 |        Incoming MCP Request       |
                 +-----------------------------------+
                                   |
                       Is Tool Call Mutating?
                       /                   \
                      /                     \
              [NO: Read-Only]          [YES: Mutating]
                    |                        |
                    v                        v
            Forward Upstream             Create Record
              (HTTP 200)             Status: PENDING
                                             |
                                             +<----------------------+
                                             |                       |
                                             v                       |
                                     [Expiration TTL]        [Approval Request]
                                             |                       |
                                             v                       v
                                      Status: EXPIRED         Status: APPROVED
                                                                     |
                                                                     v
                                                             Status: EXECUTING
                                                                     |
                                                     +---------------+---------------+
                                                     |                               |
                                                     v                               v
                                             Status: COMPLETED                Status: FAILED
```

### 5.2 Atomic Replay Protection (`app/pending_store.py`)
To prevent concurrent approval requests from executing a nonce multiple times, `claim_for_approval(...)` uses atomic SQL updates:
```sql
UPDATE pending_requests 
SET status = 'approved', approved_at = :now, approved_by = :operator
WHERE nonce = :nonce AND status = 'pending';
```
If `rowcount == 0`, the claim fails immediately, returning either `already_processed`, `expired`, or `not_found`. Sequential re-approvals are rejected with `HTTP 409 Conflict`.

### 5.3 Audit Lineage & Observability Pipeline (`app/audit/events.py`)
Every pipeline state transition emits immutable, structured audit events to the database (`AuditEventModel`):
* `ProxyRequestReceived` -> `RequestClassified` -> `ApprovalCreated` -> `ApprovalValidated` -> `ExecutionStarted` -> `ExecutionFinished` / `ExecutionFailed`.

---

## 🔌 6. Integration Capabilities & External Interfaces

### 6.1 HTTP REST & Proxy Endpoints

| Method | Endpoint | Auth Required | Description |
| :--- | :--- | :--- | :--- |
| `POST` | `/` | Optional / Configurable | Main MCP proxy entrypoint. Classifies and forwards read-only calls; suspends mutating calls. |
| `POST` | `/approve/` | `APPROVE_REQUEST` | Releases a suspended pending request by `nonce` and optional HMAC signature. |
| `GET` | `/approve/pending` | `VIEW_PENDING` | Lists all active non-expired pending requests. |
| `GET` | `/approve/history` | `VIEW_HISTORY` | Returns execution history logs. |
| `GET` | `/approve/audit` | `VIEW_AUDIT` | Returns append-only system audit events. |
| `POST` | `/approve/cleanup` | `MANAGE_SYSTEM` | Manually triggers purging of expired/completed records. |
| `GET` | `/approve/operators`| `MANAGE_USERS` | Lists registered operators. |
| `POST` | `/approve/operators`| `MANAGE_USERS` | Creates a new operator account with hashed API key. |
| `DELETE`| `/approve/operators/{id}`| `MANAGE_USERS` | Deletes an operator account. |
| `GET` | `/health` | None | Service liveness probe. |
| `GET` | `/live` | None | Container liveness check. |
| `GET` | `/ready` | None | Comprehensive system readiness check (DB, pending store, execution engine, auth). |
| `GET` | `/metrics` | None | Prometheus metrics scraper endpoint. |
| `GET` | `/dashboard/summary` | None | Aggregated stats (pending count, success rate, avg latency) for UI display. |
| `GET` | `/dashboard` | None | Web Control Room React SPA. |

### 6.2 Upstream Integration Targets
* **Upstream MCP Servers:** Any HTTP-accessible MCP server executing infrastructure commands (e.g., `K8S_MCP_SERVER_URL=http://127.0.0.1:8000`).
* **Alibaba Cloud Model Studio / DashScope:** Compatible-mode OpenAPI endpoint (`https://dashscope-intl.aliyuncs.com/compatible-mode/v1`).

---

## 🛠️ 7. Strengths & Reusable Components

The Aegis / VetoOps codebase contains modular components designed for extraction into enterprise security & autonomous response frameworks:

### 1. Standalone MCP Zero-Trust Interception Proxy (`app/routes/proxy.py` & `app/rpc_parser.py`)
A self-contained inspection and suspension engine for any MCP server protocol. Easily extensible to cloud APIs (AWS IAM, Terraform, Ansible, SQL databases).

### 2. Cryptographic Request Fingerprinting & HMAC Engine (`app/crypto.py`)
A standalone helper library for generating SHA-256 payload digests, UUID4 single-use nonces, and verifying constant-time HMAC signatures across distributed services.

### 3. Database-Backed Atomic Replay Protection Store (`app/pending_store.py`)
A thread-safe, TTL-aware pending request state machine using SQL optimistic locking to prevent race conditions and double-execution attacks in distributed architectures.

### 4. Pluggable Execution Engine Framework (`app/execution/`)
An extensible execution backend architecture (`ExecutionEngine` abstract base class + `ExecutionFactory`) enabling effortless swapping of backend transport layers (Kubernetes HTTP, SSH, AWS SDK, gRPC, Failsafe eBPF).

### 5. BPF-LSM OS Kernel Audit Reader (`app/execution/failsafe_audit.py`)
A low-overhead, file-offset-based log reader designed to parse and correlate Linux BPF-LSM audit streams with application-level API executions.

### 6. SRE Agent Loop with Context-Chaining (`agent/loop.py` & `agent/bridge.py`)
A resilient, production-ready Qwen 3.7-Max agentic loop complete with function-call extraction, tool result bridging, operator hint parsing, and turn-based context retention.

---
*Document produced automatically for the Aegis / VetoOps Repository.*
