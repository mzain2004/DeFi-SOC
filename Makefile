.PHONY: dev-up dev-down test lint

# Start local dev environment (Redis, Postgres, Anvil)
dev-up:
	docker compose -f docker-compose.dev.yml up -d

# Stop local dev environment
dev-down:
	docker compose -f docker-compose.dev.yml down -v

# Run Rust unit tests and TypeScript package tests
test:
	cargo test
	cd service/l3-signer && npm test || true

# Run Rust clippy linter (strict warnings) and Next.js eslint
lint:
	cargo clippy -- -D warnings
	cd app && npm run lint || true
