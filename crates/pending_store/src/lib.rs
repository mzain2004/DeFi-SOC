use chrono::{DateTime, Utc};
use serde_json::Value;
use shared_types::VerificationVerdict;
use sqlx::{PgPool, Row};
use uuid::Uuid;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ClaimResult {
    Claimed,
    NotFound,
    AlreadyProcessed,
    Expired,
}

/// Insert a new pending verdict record into PostgreSQL.
pub async fn insert_pending(
    pool: &PgPool,
    nonce: &str,
    alert_id: Uuid,
    org_id: Uuid,
    expires_at: DateTime<Utc>,
) -> Result<(), sqlx::Error> {
    sqlx::query(
        r#"
        INSERT INTO pending_verdicts (nonce, alert_id, org_id, status, expires_at)
        VALUES ($1, $2, $3, 'pending', $4)
        "#,
    )
    .bind(nonce)
    .bind(alert_id)
    .bind(org_id)
    .bind(expires_at)
    .execute(pool)
    .await?;

    Ok(())
}

/// Claims a pending verdict for verification using single-statement optimistic locking.
/// Handles the 3-way fallback logic (NotFound, AlreadyProcessed, Expired) as specified in aegis_patterns.md.
pub async fn claim_for_verification(
    pool: &PgPool,
    nonce: &str,
) -> Result<ClaimResult, sqlx::Error> {
    // 1. Single-statement optimistic lock: update status = 'verified' if status = 'pending' and not expired.
    let result = sqlx::query(
        r#"
        UPDATE pending_verdicts
        SET status = 'verified', updated_at = now()
        WHERE nonce = $1 AND status = 'pending' AND expires_at > now()
        "#,
    )
    .bind(nonce)
    .execute(pool)
    .await?;

    if result.rows_affected() == 1 {
        return Ok(ClaimResult::Claimed);
    }

    // 2. Fallback check: query the row to determine exact failure cause
    let row_opt = sqlx::query(
        r#"
        SELECT status, expires_at FROM pending_verdicts WHERE nonce = $1
        "#,
    )
    .bind(nonce)
    .fetch_optional(pool)
    .await?;

    match row_opt {
        None => Ok(ClaimResult::NotFound),
        Some(row) => {
            let expires_at: DateTime<Utc> = row.try_get("expires_at")?;
            if expires_at <= Utc::now() {
                // Mark record as expired
                let _ = sqlx::query(
                    r#"
                    UPDATE pending_verdicts
                    SET status = 'expired', updated_at = now()
                    WHERE nonce = $1
                    "#,
                )
                .bind(nonce)
                .execute(pool)
                .await;
                Ok(ClaimResult::Expired)
            } else {
                Ok(ClaimResult::AlreadyProcessed)
            }
        }
    }
}

/// Records the final verification verdict JSON for a claimed request.
pub async fn record_verdict(
    pool: &PgPool,
    nonce: &str,
    verdict: &VerificationVerdict,
) -> Result<(), sqlx::Error> {
    let verdict_json: Value = serde_json::to_value(verdict).map_err(|e| {
        sqlx::Error::Protocol(format!("Failed to serialize VerificationVerdict: {}", e))
    })?;

    sqlx::query(
        r#"
        UPDATE pending_verdicts
        SET verdict_json = $2, updated_at = now()
        WHERE nonce = $1
        "#,
    )
    .bind(nonce)
    .bind(verdict_json)
    .execute(pool)
    .await?;

    Ok(())
}
