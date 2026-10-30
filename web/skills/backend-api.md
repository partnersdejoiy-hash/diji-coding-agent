---
name: backend-api
description: Clean REST or RPC services with validation, errors and auth done right.
---
# Backend APIs

- Validate every input at the boundary (zod / pydantic). Reject unknown fields on writes.
- Consistent errors: proper status codes (400 validation, 401 no auth, 403 forbidden, 404, 409 conflict, 429, 500) and a JSON body `{ "error": "human message" }`. Never leak stack traces or secrets.
- Auth: hashed passwords (argon2/bcrypt), short-lived tokens or HTTP-only secure cookies, authorization checked per resource, not just per route.
- Data: parameterised queries only, transactions for multi-step writes, idempotency keys for payments and retries.
- Config from environment variables with a startup check that fails fast when one is missing.
- Add pagination to list endpoints, rate limits on auth and expensive routes, timeouts on outbound calls.
- Ship a health endpoint, structured logs (no secrets), and one test per endpoint for the happy path and the main failure.
- Node: Express/Hono/Fastify with ESM. Python: FastAPI with async where IO-bound.
