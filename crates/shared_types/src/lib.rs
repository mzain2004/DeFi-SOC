// TODO: Phase 1 — Define normalized alert/transaction schema types
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TransactionTelemetry {
    pub calldata: Vec<u8>,
    pub target_contract: String,
    pub gas_metrics: GasMetrics,
    pub sender: String,
    pub block_env: BlockEnv,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GasMetrics {
    pub gas_limit: u64,
    pub max_fee_per_gas: u64,
    pub max_priority_fee_per_gas: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BlockEnv {
    pub block_number: u64,
    pub timestamp: u64,
    pub base_fee: u64,
}
