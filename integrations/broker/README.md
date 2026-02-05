# Broker — Message Broker & CDC Infrastructure

## Purpose

Event-driven messaging layer that replaces direct HTTP webhooks for integration lifecycle events, enables push-mode data sources, and powers CDC (Change Data Capture) from PostgreSQL to the Go API.

## Why It Exists

The marketplace introduces three messaging needs that HTTP request/response doesn't handle well:

1. **Lifecycle events** (install, uninstall, data updates) need delivery guarantees and retry semantics — a broker provides these out of the box vs. building retry logic into the Go API.
2. **Push-mode data sources** need a topic-based publish model where integrations push data directly, skipping the poll cycle for real-time delivery.
3. **CDC** captures PostgreSQL changes and streams them to consumers, enabling the Go API to react to data written by ingestion services without polling the database.

See [MARKETPLACE.md — Data Pipeline Architecture](../MARKETPLACE.md#data-pipeline-architecture) for the full pipeline diagram.

## How It Fits

```
Ingestion Services ──► PostgreSQL ──► CDC Connector ──► Broker ──► Go API
                                                          ▲
                                                          │
                                                 3rd-party integrations
                                                 (push-mode, via Logto M2M)
```

- **Producers**: CDC connector (database changes), push-mode integrations (authenticated via Logto M2M tokens), lifecycle service
- **Consumers**: Go API, integration services (lifecycle events)
- **Auth**: M2M tokens from Logto for third-party publishers
- **Relates to**: `ingestion/` services (current data producers), `api/` (consumer), `lifecycle/` (publishes install/uninstall events)

## What Goes Here

```
broker/
├── README.md               # This file
├── docker-compose.yml      # Local broker + CDC setup
├── Dockerfile              # If wrapping broker with custom config
├── cdc/                    # CDC connector configuration
│   ├── debezium.json       # Debezium connector config
│   └── README.md
├── topics/                 # Topic definitions and schemas
│   └── topics.yaml
└── monitoring/             # Broker-specific monitoring config
    └── alerts.yaml
```

## Key Decisions / Open Questions

- **Which broker?** NATS (lightweight, fits self-hosted Coolify model), Kafka (durable replay, high throughput), or RabbitMQ (mature, good task-style routing). See [MARKETPLACE.md — Open Questions](../MARKETPLACE.md#open-questions).
- **Which CDC connector?** Debezium is the standard choice — runs well in Docker/Coolify.
- **Monitoring**: Consumer lag, DLQ depth, and throughput per integration all need dashboards. Tooling depends on broker choice (Kafka UI, NATS dashboard, RabbitMQ management plugin).
- **Topic naming**: `integrations.{name}.data` for push-mode data, `integrations.lifecycle` for install/uninstall events.
