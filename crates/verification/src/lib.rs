use alloy::primitives::{Address, U256};
use reqwest::Client;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use shared_types::TransactionPayload;
use std::str::FromStr;

#[derive(Debug, thiserror::Error)]
pub enum VerificationError {
    #[error("RPC request failed: {0}")]
    RpcError(String),
    #[error("JSON parsing error: {0}")]
    JsonError(#[from] serde_json::Error),
    #[error("Simulation error: {0}")]
    SimulationError(String),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StateChange {
    pub address: Address,
    pub storage_slot: U256,
    pub before: U256,
    pub after: U256,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SimulationResult {
    pub success: bool,
    pub state_changes: Vec<StateChange>,
    pub revert_reason: Option<String>,
    pub gas_used: u64,
}

/// Simulates transaction execution at `fork_block` using EVM trace against `rpc_url`.
pub async fn simulate_transaction(
    rpc_url: &str,
    fork_block: u64,
    tx: &TransactionPayload,
) -> Result<SimulationResult, VerificationError> {
    let client = Client::new();

    let block_hex = format!("0x{:x}", fork_block);
    let from_hex = format!("{:?}", tx.from);
    let to_hex = tx.to.map(|a| format!("{:?}", a));
    let data_hex = format!("0x{}", hex::encode(&tx.calldata));
    let value_hex = format!("0x{:x}", tx.value);
    let gas_hex = format!("0x{:x}", tx.gas_limit);

    let mut call_obj = json!({
        "from": from_hex,
        "data": data_hex,
        "value": value_hex,
        "gas": gas_hex
    });
    if let Some(to) = to_hex {
        call_obj.as_object_mut().unwrap().insert("to".to_string(), json!(to));
    }

    // 1. Attempt debug_traceCall with prestateTracer in onlyDiff mode
    let payload = json!({
        "jsonrpc": "2.0",
        "method": "debug_traceCall",
        "params": [
            call_obj,
            block_hex,
            {
                "tracer": "prestateTracer",
                "tracerConfig": {
                    "onlyDiff": true
                }
            }
        ],
        "id": 1
    });

    let res = client
        .post(rpc_url)
        .json(&payload)
        .send()
        .await
        .map_err(|e| VerificationError::RpcError(e.to_string()))?;

    let json_res: Value = res
        .json()
        .await
        .map_err(|e| VerificationError::RpcError(e.to_string()))?;

    let mut state_changes = Vec::new();
    let mut success = true;
    let mut revert_reason = None;
    let mut gas_used = 21000u64;

    if let Some(result) = json_res.get("result") {
        if let Some(post) = result.get("post") {
            let pre = result.get("pre");
            if let Some(post_obj) = post.as_object() {
                for (addr_str, post_val) in post_obj {
                    let addr = Address::from_str(addr_str).unwrap_or_default();
                    if let Some(storage) = post_val.get("storage").and_then(|s| s.as_object()) {
                        for (slot_str, after_val_str) in storage {
                            let slot = parse_u256(slot_str);
                            let after_val = parse_u256(after_val_str.as_str().unwrap_or("0x0"));

                            let before_val = pre
                                .and_then(|p| p.get(addr_str))
                                .and_then(|p| p.get("storage"))
                                .and_then(|s| s.get(slot_str))
                                .map(|v| parse_u256(v.as_str().unwrap_or("0x0")))
                                .unwrap_or(U256::ZERO);

                            state_changes.push(StateChange {
                                address: addr,
                                storage_slot: slot,
                                before: before_val,
                                after: after_val,
                            });
                        }
                    }
                }
            }
        }
    } else if let Some(error) = json_res.get("error") {
        let msg = error.get("message").and_then(|m| m.as_str()).unwrap_or("RPC Error");
        if msg.contains("revert") || msg.contains("execution reverted") {
            success = false;
            revert_reason = Some(msg.to_string());
        }
    }

    // 2. Fallback eth_call to verify success / revert reason if needed
    let eth_call_payload = json!({
        "jsonrpc": "2.0",
        "method": "eth_call",
        "params": [
            call_obj,
            block_hex
        ],
        "id": 2
    });

    if let Ok(res) = client.post(rpc_url).json(&eth_call_payload).send().await {
        if let Ok(json_val) = res.json::<Value>().await {
            if let Some(err) = json_val.get("error") {
                success = false;
                revert_reason = Some(
                    err.get("message")
                        .and_then(|m| m.as_str())
                        .unwrap_or("Execution reverted")
                        .to_string(),
                );
            }
        }
    }

    // Gas estimation fallback
    let gas_payload = json!({
        "jsonrpc": "2.0",
        "method": "eth_estimateGas",
        "params": [call_obj, block_hex],
        "id": 3
    });
    if let Ok(res) = client.post(rpc_url).json(&gas_payload).send().await {
        if let Ok(json_val) = res.json::<Value>().await {
            if let Some(gas_hex_str) = json_val.get("result").and_then(|r| r.as_str()) {
                let clean = gas_hex_str.trim_start_matches("0x");
                if let Ok(g) = u64::from_str_radix(clean, 16) {
                    gas_used = g;
                }
            }
        }
    }

    Ok(SimulationResult {
        success,
        state_changes,
        revert_reason,
        gas_used,
    })
}

fn parse_u256(s: &str) -> U256 {
    let clean = s.trim_start_matches("0x");
    if clean.is_empty() {
        return U256::ZERO;
    }
    U256::from_str_radix(clean, 16).unwrap_or(U256::ZERO)
}

#[cfg(test)]
mod tests {
    use super::*;
    use alloy::primitives::{bytes, address};

    #[tokio::test]
    async fn test_simulate_transaction_offline_error() {
        let tx = TransactionPayload {
            hash: None,
            from: address!("0000000000000000000000000000000000000001"),
            to: Some(address!("0000000000000000000000000000000000000002")),
            calldata: bytes!("12345678"),
            value: U256::ZERO,
            gas_limit: U256::from(100_000),
            gas_price: None,
            nonce: 1,
        };

        // Point to non-existent endpoint
        let res = simulate_transaction("http://127.0.0.1:59999", 100, &tx).await;
        assert!(res.is_err());
    }
}
