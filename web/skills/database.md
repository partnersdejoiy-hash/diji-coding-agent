---
name: database
description: Schemas, migrations, indexes and safe queries.
---
# Databases & SQL

- Model the domain first: entities, relationships, which fields are required, what must be unique.
- Primary keys: UUID/ULID or bigint identity. Timestamps `created_at`/`updated_at` with time zones.
- Constraints in the database, not only in code: NOT NULL, UNIQUE, FOREIGN KEY with sensible ON DELETE, CHECK.
- Index what you filter, join and sort on; composite index order matches the query. Check with `EXPLAIN ANALYZE`.
- Every schema change is a migration file, reversible where possible, never edited after it ran in production.
- Queries are parameterised. Avoid N+1 by joining or batching. Paginate with keyset (WHERE id > $last) for large tables.
- Supabase/Postgres: enable Row Level Security on every table exposed to clients and write policies per role.
- MongoDB: design documents around access patterns, add indexes, validate with a JSON schema.
- Never run destructive SQL (DROP, TRUNCATE, DELETE without WHERE) without stating it clearly first.
