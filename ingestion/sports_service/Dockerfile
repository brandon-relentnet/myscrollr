FROM rust:1-slim-bookworm AS builder

WORKDIR /app
COPY . .

RUN apt-get update && apt-get install -y pkg-config libssl-dev && rm -rf /var/lib/apt/lists/*

RUN cargo build --release --bin sports_service

FROM debian:bookworm-slim

WORKDIR /app

RUN apt-get update && apt-get install -y ca-certificates libssl-dev && rm -rf /var/lib/apt/lists/*

COPY --from=builder /app/target/release/sports_service .

# Fixed path: source is /app/configs because sports_service is the root of this build context
COPY --from=builder /app/configs ./configs

CMD ["./sports_service"]