FROM rust:1-slim-bookworm AS builder

WORKDIR /app
COPY . .

RUN apt-get update && apt-get install -y pkg-config libssl-dev && rm -rf /var/lib/apt/lists/*

RUN cargo build --release --bin scrollr_backend

FROM debian:bookworm-slim

WORKDIR /app

RUN apt-get update && apt-get install -y ca-certificates libssl-dev && rm -rf /var/lib/apt/lists/*

COPY --from=builder /app/target/release/scrollr_backend .
COPY --from=builder /app/.env .

CMD ["./scrollr_backend"]