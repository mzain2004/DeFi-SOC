use alloy::primitives::{Address, Bytes, U256, B256 as H256};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub enum AlertSource {
    Forta,
    Tenderly,
    MempoolListener,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NormalizedAlert {
    pub alert_id: Uuid,
    pub source: AlertSource,
    pub received_at: DateTime<Utc>,
    pub tx: TransactionPayload,
    pub block_env: BlockEnvironment,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TransactionPayload {
    pub hash: Option<H256>,
    pub from: Address,
    pub to: Option<Address>,
    pub calldata: Bytes,
    pub value: U256,
    pub gas_limit: U256,
    pub gas_price: Option<U256>,
    pub nonce: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BlockEnvironment {
    pub block_number: u64,
    pub timestamp: u64,
    pub base_fee: Option<U256>,
    pub chain_id: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub enum VerdictType {
    Breach,
    NoBreach,
    SimulationFailed,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VerificationVerdict {
    pub alert_id: Uuid,
    pub verdict: VerdictType,
    pub invariant_results: Vec<InvariantResult>,
    pub tvl_delta_usd: Option<f64>,
    pub evidence_trace_id: Uuid,
    pub verified_at: DateTime<Utc>,
    pub latency_ms: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct InvariantResult {
    pub invariant_name: String,
    pub breached: bool,
    pub detail: String,
}
