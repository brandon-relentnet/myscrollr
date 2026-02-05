# SDK / Python — Python SDK

## Purpose

Official Python SDK for building MyScrollr integrations, targeting data-heavy backends, ML/analytics pipelines, and Python web services. Provides typed data classes for all platform contracts, OIDC/JWKS auth validation, and broker client helpers.

## Why It Exists

Python is the dominant language for data science, ML, and analytics — exactly the kind of data source integrations that extend MyScrollr's financial and sports data feeds. A Python SDK lowers the barrier for developers who want to build integrations that process, transform, or enrich data using Python's ecosystem (pandas, numpy, scikit-learn, etc.).

See [MARKETPLACE.md — SDK](../MARKETPLACE.md#sdk) for the full capability list.

## How It Fits

- **Data source developers**: Import data source contract types (Pydantic models), auth helpers, and broker client. Build `GET /data` endpoints with FastAPI/Flask and publish push-mode data.
- **Auth**: Standard OIDC/JWKS validation (no official Logto Python SDK, so the SDK wraps `PyJWT` + `jwcrypto` or similar for token validation).
- **Types align with**: `schemas/` (shared JSON schemas → generated Pydantic models)

## What Goes Here

```
sdk/python/
├── README.md               # This file
├── pyproject.toml          # Package configuration (PEP 621)
├── src/
│   └── myscrollr_sdk/
│       ├── __init__.py
│       ├── auth/
│       │   ├── middleware.py    # ASGI/WSGI middleware for JWT validation
│       │   └── m2m.py          # M2M token client (Client Credentials grant)
│       ├── contracts/
│       │   ├── data_source.py  # GET /data, GET /schema type definitions (Pydantic)
│       │   ├── health.py       # GET /health response model
│       │   └── manifest.py     # Manifest model
│       ├── broker/
│       │   └── client.py       # Push-mode data publishing client
│       └── testing/
│           ├── mock_api.py     # Mock MyScrollr API for local testing
│           └── dev_server.py   # Local development server
├── examples/
│   ├── fastapi_data_source/    # Example FastAPI pull-mode data source
│   └── push_source/            # Example push-mode data source
└── tests/
```

**Key dependencies**: `PyJWT` + `jwcrypto` for OIDC validation, `pydantic` for typed contracts, `httpx` for HTTP client.

## Key Decisions / Open Questions

- **Package name**: `myscrollr-sdk` on PyPI.
- **Framework support**: FastAPI-first (async, Pydantic-native), with Flask adapter?
- **Pydantic v2**: Use Pydantic v2 for model definitions — aligns with FastAPI's direction.
- **No widget support**: Widgets are frontend (TypeScript/React only). Python SDK focuses on backend data source and app integrations.
