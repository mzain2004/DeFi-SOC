use chrono::{Duration, Utc};
use pending_store::{claim_for_verification, insert_pending, ClaimResult};
use sqlx::PgPool;
use uuid::Uuid;

#[tokio::test]
async fn test_concurrent_claim_race_condition() {
    let database_url = std::env::var("DATABASE_URL")
        .unwrap_or_else(|_| "postgresql://postgres:postgres@localhost:5432/defisoc_dev".to_string());

    let pool = match PgPool::connect(&database_url).await {
        Ok(p) => p,
        Err(_) => {
            eprintln!("Skipping PostgreSQL integration test: DATABASE_URL not reachable at {}", database_url);
            return;
        }
    };

    // Ensure migration / table exists
    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS pending_verdicts (
            nonce TEXT PRIMARY KEY,
            alert_id UUID NOT NULL,
            org_id UUID NOT NULL,
            status TEXT NOT NULL,
            verdict_json JSONB,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            expires_at TIMESTAMPTZ NOT NULL
        );
        "#,
    )
    .execute(&pool)
    .await
    .expect("Failed to create table");

    let nonce = format!("race-test-{}", Uuid::new_v4());
    let alert_id = Uuid::new_v4();
    let org_id = Uuid::new_v4();
    let expires_at = Utc::now() + Duration::seconds(60);

    // Insert pending
    insert_pending(&pool, &nonce, alert_id, org_id, expires_at)
        .await
        .expect("Failed to insert pending record");

    // Spawn 2 concurrent claims
    let pool_clone1 = pool.clone();
    let nonce_clone1 = nonce.clone();
    let task1 = tokio::spawn(async move {
        claim_for_verification(&pool_clone1, &nonce_clone1).await
    });

    let pool_clone2 = pool.clone();
    let nonce_clone2 = nonce.clone();
    let task2 = tokio::spawn(async move {
        claim_for_verification(&pool_clone2, &nonce_clone2).await
    });

    let (res1, res2) = tokio::join!(task1, task2);
    let claim1 = res1.expect("task1 panicked").expect("claim1 query error");
    let claim2 = res2.expect("task2 panicked").expect("claim2 query error");

    // Exactly one must be Claimed, the other AlreadyProcessed
    let claimed_count = (if claim1 == ClaimResult::Claimed { 1 } else { 0 })
        + (if claim2 == ClaimResult::Claimed { 1 } else { 0 });
    assert_eq!(claimed_count, 1, "Exactly one claim must succeed");

    let processed_count = (if claim1 == ClaimResult::AlreadyProcessed { 1 } else { 0 })
        + (if claim2 == ClaimResult::AlreadyProcessed { 1 } else { 0 });
    assert_eq!(processed_count, 1, "Exactly one claim must be AlreadyProcessed");
}
