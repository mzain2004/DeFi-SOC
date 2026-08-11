use ingestion::create_app;
use std::net::SocketAddr;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let redis_url = std::env::var("REDIS_URL").unwrap_or_else(|_| "redis://127.0.0.1:6379/0".to_string());
    let redis_client = redis::Client::open(redis_url)?;

    let app = create_app(redis_client);

    let addr = SocketAddr::from(([0, 0, 0, 0], 3000));
    println!("Ingestion webhook service listening on http://{}", addr);

    let listener = tokio::net::TcpListener::bind(addr).await?;
    axum::serve(listener, app).await?;

    Ok(())
}
