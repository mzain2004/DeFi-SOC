use alloy::primitives::{Address, Bytes, U256, B256 as H256};
use axum::{extract::State, http::StatusCode, response::IntoResponse, routing::post, Json, Router};
use chrono::Utc;
use redis::AsyncCommands;
use serde::{Deserialize, Serialize};
use shared_types::{AlertSource, BlockEnvironment, NormalizedAlert, TransactionPayload};
use std::str::FromStr;
use std::sync::Arc;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FortaAlertPayload {
    pub alert_id: Option<Uuid>,
    pub tx_hash: Option<String>,
    pub from: String,
    pub to: Option<String>,
    pub calldata: String,
    pub value: Option<String>,
    pub gas_limit: Option<u64>,
    pub gas_price: Option<String>,
    pub nonce: Option<u64>,
    pub block_number: u64,
    pub timestamp: Option<u64>,
    pub base_fee: Option<String>,
    pub chain_id: u64,
}

pub struct AppState {
    pub redis_client: redis::Client,
}

pub fn create_app(redis_client: redis::Client) -> Router {
    let state = Arc::new(AppState { redis_client });
    Router::new()
        .route("/webhook/forta", post(handle_forta_webhook))
        .with_state(state)
}

pub async fn handle_forta_webhook(
    State(state): State<Arc<AppState>>,
    Json(payload): Json<FortaAlertPayload>,
) -> impl IntoResponse {
    let alert = match normalize_forta_payload(payload) {
        Ok(a) => a,
        Err(err_msg) => {
            return (
                StatusCode::BAD_REQUEST,
                Json(serde_json::json!({ "error": err_msg })),
            );
        }
    };

    let serialized = match serde_json::to_string(&alert) {
        Ok(s) => s,
        Err(e) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({ "error": e.to_string() })),
            );
        }
    };

    let mut con = match state.redis_client.get_multiplexed_async_connection().await {
        Ok(c) => c,
        Err(e) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({ "error": format!("Redis connection error: {}", e) })),
            );
        }
    };

    let pub_res: Result<(), redis::RedisError> = con.publish("alerts:normalized", serialized).await;

    if let Err(e) = pub_res {
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({ "error": format!("Redis publish error: {}", e) })),
        );
    }

    (
        StatusCode::OK,
        Json(serde_json::json!({ "status": "published", "alert_id": alert.alert_id })),
    )
}

pub fn normalize_forta_payload(payload: FortaAlertPayload) -> Result<NormalizedAlert, String> {
    let alert_id = payload.alert_id.unwrap_or_else(Uuid::new_v4);
    let from = Address::from_str(&payload.from)
        .map_err(|e| format!("Invalid from address: {}", e))?;
    let to = match payload.to {
        Some(ref addr) if !addr.is_empty() => Some(
            Address::from_str(addr).map_err(|e| format!("Invalid to address: {}", e))?,
        ),
        _ => None,
    };

    let clean_calldata = payload.calldata.trim_start_matches("0x");
    let calldata_bytes = hex::decode(clean_calldata)
        .map_err(|e| format!("Invalid calldata hex: {}", e))?;

    let value = parse_u256_str(payload.value.as_deref().unwrap_or("0x0"))?;
    let gas_price = match payload.gas_price {
        Some(ref g) => Some(parse_u256_str(g)?),
        None => None,
    };
    let base_fee = match payload.base_fee {
        Some(ref b) => Some(parse_u256_str(b)?),
        None => None,
    };

    let hash = match payload.tx_hash {
        Some(ref h) => {
            let clean = h.trim_start_matches("0x");
            let bytes = hex::decode(clean).map_err(|e| format!("Invalid tx_hash hex: {}", e))?;
            if bytes.len() == 32 {
                Some(H256::from_slice(&bytes))
            } else {
                None
            }
        }
        None => None,
    };

    let tx = TransactionPayload {
        hash,
        from,
        to,
        calldata: Bytes::from(calldata_bytes),
        value,
        gas_limit: U256::from(payload.gas_limit.unwrap_or(300_000)),
        gas_price,
        nonce: payload.nonce.unwrap_or(0),
    };

    let block_env = BlockEnvironment {
        block_number: payload.block_number,
        timestamp: payload.timestamp.unwrap_or_else(|| Utc::now().timestamp() as u64),
        base_fee,
        chain_id: payload.chain_id,
    };

    Ok(NormalizedAlert {
        alert_id,
        source: AlertSource::Forta,
        received_at: Utc::now(),
        tx,
        block_env,
    })
}

fn parse_u256_str(s: &str) -> Result<U256, String> {
    let clean = s.trim_start_matches("0x");
    if clean.is_empty() {
        return Ok(U256::ZERO);
    }
    U256::from_str_radix(clean, 16)
        .or_else(|_| U256::from_str_radix(s, 10))
        .map_err(|e| format!("Failed to parse U256 '{}': {}", s, e))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_normalize_forta_payload() {
        let payload = FortaAlertPayload {
            alert_id: None,
            tx_hash: Some("0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef".to_string()),
            from: "0x0000000000000000000000000000000000000001".to_string(),
            to: Some("0x0000000000000000000000000000000000000002".to_string()),
            calldata: "0x12345678".to_string(),
            value: Some("0x100".to_string()),
            gas_limit: Some(100000),
            gas_price: None,
            nonce: Some(5),
            block_number: 123456,
            timestamp: Some(1700000000),
            base_fee: None,
            chain_id: 1,
        };

        let alert = normalize_forta_payload(payload).unwrap();
        assert_eq!(alert.source, AlertSource::Forta);
        assert_eq!(alert.block_env.block_number, 123456);
        assert_eq!(alert.tx.nonce, 5);
        assert!(alert.tx.hash.is_some());
    }
}
