# Defi Soc — Developer & AI Instructions (CLAUDE.md)

## Absolute Rules (Verbatim Enforcement)

1. Gate 1 (execution trigger) can ONLY be satisfied by revm invariant engine output. LLM output must never reach the pause-decision path. Any PR/diff that wires LLM confidence into the L3 trigger is rejected on sight.
2. `cargo test` and `cargo clippy -- -D warnings` must both pass before every commit.
3. Never commit private keys, session key material, or .env files — testnet or otherwise.
4. Never modify app/middleware.ts (carried over from PhishSlayer-V2, do not touch).
5. Product/company: Defi Soc, under Cygnus Ventures SMC-Pvt Ltd.
6. Rust workspace crates follow one-responsibility-per-crate — no crate may import from a layer above it (l3 may import l2 types, l2 may not import l3).
7. All Postgres/Supabase queries must be org-scoped (multi-tenant RLS, same pattern as PhishSlayer-V2).

## Operational Context & Workflow Rules

- **Workspace Root**: `D:\Defi Soc`
- **Repository Structure**:
  - `app/`: Next.js 15 + Supabase + Clerk + Polar dashboard shell
  - `crates/`: Rust workspace handling low-latency telemetry ingestion, EVM trace verification, invariant evaluation, crypto verification, and atomic pending storage
  - `service/l3-signer/`: Standalone Node.js/Viem service for EIP-712 session-key signing & emergency execution
  - `docs/`: System documentation (`strip_report.md`, `aegis_patterns.md`, `dev_setup.md`)
