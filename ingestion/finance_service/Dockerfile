FROM lukemathwalker/cargo-chef:latest-rust-1 AS chef
WORKDIR /app

FROM chef AS planner
COPY . .
RUN cargo chef prepare --recipe-path recipe.json

FROM chef AS builder
COPY --from=planner /app/recipe.json recipe.json
# Build dependencies
RUN apt-get update && apt-get install -y pkg-config libssl-dev && rm -rf /var/lib/apt/lists/*
RUN cargo chef cook --release --recipe-path recipe.json

# Build application
COPY . .
RUN cargo build --release --bin finance_service

FROM debian:trixie-slim
WORKDIR /app

# Define Build Args
ARG DATABASE_URL
ARG FINNHUB_API_KEY

# Set Envs for Runtime
ENV DATABASE_URL=$DATABASE_URL
ENV FINNHUB_API_KEY=$FINNHUB_API_KEY

RUN apt-get update && apt-get install -y ca-certificates libssl-dev curl && rm -rf /var/lib/apt/lists/*
COPY --from=builder /app/target/release/finance_service .
COPY --from=builder /app/configs ./configs

CMD ["./finance_service"]
