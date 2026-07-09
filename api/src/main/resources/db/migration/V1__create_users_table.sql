-- V1: Create users table (lightweight for v1 — no auth fields yet)
CREATE TABLE users (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    display_name VARCHAR(100),
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
