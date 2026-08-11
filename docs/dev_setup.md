# DeFi SOC — Local Development Environment Setup (`dev_setup.md`)

This guide explains how to spin up the local development stack for **Defi Soc**.

---

## 1. Toolchain & Compiler Configuration

* **Toolchain Target**: `x86_64-pc-windows-msvc`
* **C++ Linker Requirement**: Visual Studio 2022 C++ Build Tools (`Microsoft.VisualStudio.Workload.VCTools`). Installed via winget (`Microsoft.VisualStudio.2022.BuildTools`).
* **Rust Toolchain**: `rustc 1.97.1` / `cargo 1.97.1`
* **Node.js**: `v20+`

---

## 2. Docker Services Overview (`docker-compose.dev.yml`)

The local environment runs three isolated containers for development and testing:

| Service | Port | Purpose in Defi Soc Stack |
| :--- | :--- | :--- |
| **`redis`** | `6379` | Handles low-latency telemetry event streaming and L1 $\rightarrow$ L2 handoff queueing between ingestion and verification. |
| **`postgres`** | `5432` | Serves as a local PostgreSQL stand-in for Supabase during offline Phase 1 Rust unit & integration testing (prevents hitting live Supabase DB). |
| **`anvil`** | `8545` | Foundry's local Ethereum test node. **Forks live Ethereum mainnet state** via `--fork-url ${ETH_MAINNET_RPC_URL}` for real-world EVM contract trace & invariant testing. |

> **Important Note on Anvil Forking**:
> The `anvil` service requires `ETH_MAINNET_RPC_URL` to be configured in your local `.env` file prior to container startup. Ensure you copy `.env.example` to `.env` and populate `ETH_MAINNET_RPC_URL` with a valid Ethereum mainnet RPC endpoint (e.g., Alchemy / Infura).

---

## 3. Quickstart Commands

### Start All Services
```bash
make dev-up
# Or directly via Docker Compose:
docker compose -f docker-compose.dev.yml up -d
```

### Check Container Health
```bash
docker compose -f docker-compose.dev.yml ps
```

### Run Rust Workspace Tests & Linter
```bash
make test
make lint
```

### Tear Down Services
```bash
make dev-down
```
