FROM rust:1-slim-bookworm AS builder

WORKDIR /app
COPY . .

RUN apt-get update && apt-get install -y pkg-config libssl-dev && rm -rf /var/lib/apt/lists/*

RUN cargo build --release --bin sports_service

FROM debian:bookworm-slim

WORKDIR /app

RUN apt-get update && apt-get install -y ca-certificates libssl-dev && rm -rf /var/lib/apt/lists/*

COPY --from=builder /app/target/release/sports_service .
COPY --from=builder /app/.env .
# Copy config from the service directory
COPY --from=builder /app/sports_service/configs ./configs

CMD ["./sports_service"]