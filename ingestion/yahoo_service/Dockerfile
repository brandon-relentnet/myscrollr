FROM lukemathwalker/cargo-chef:latest-rust-1 AS chef
WORKDIR /app

FROM chef AS planner
COPY . .
RUN cargo chef prepare --recipe-path recipe.json

FROM chef AS builder
COPY --from=planner /app/recipe.json recipe.json

# Build dependencies - this is the cached layer
RUN apt-get update && apt-get install -y pkg-config libssl-dev && rm -rf /var/lib/apt/lists/*

# Copy local dependency metadata so cargo chef can "cook" it
# We copy the folder because chef needs to see the Cargo.toml of the local dependency
COPY yahoo_fantasy yahoo_fantasy

RUN cargo chef cook --release --recipe-path recipe.json

# Build application
COPY . .
RUN cargo build --release --bin yahoo_service

FROM debian:trixie-slim
WORKDIR /app

# Define Build Args
ARG DATABASE_URL
ARG REDIS_URL
ARG YAHOO_CLIENT_ID
ARG YAHOO_CLIENT_SECRET
ARG YAHOO_CALLBACK_URL
ARG DOMAIN_NAME
ARG CONTACT_EMAIL
ARG ACME_ENABLED

# Set Envs for Runtime
ENV DATABASE_URL=$DATABASE_URL
ENV REDIS_URL=$REDIS_URL
ENV YAHOO_CLIENT_ID=$YAHOO_CLIENT_ID
ENV YAHOO_CLIENT_SECRET=$YAHOO_CLIENT_SECRET
ENV YAHOO_CALLBACK_URL=$YAHOO_CALLBACK_URL
ENV DOMAIN_NAME=$DOMAIN_NAME
ENV CONTACT_EMAIL=$CONTACT_EMAIL
ENV ACME_ENABLED=$ACME_ENABLED

RUN apt-get update && apt-get install -y ca-certificates libssl-dev curl && rm -rf /var/lib/apt/lists/*
COPY --from=builder /app/target/release/yahoo_service .

CMD ["./yahoo_service"]