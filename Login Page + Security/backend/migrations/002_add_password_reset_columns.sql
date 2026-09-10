-- Migration: 002_add_password_reset_columns
-- Adds columns needed to support the "Forgot Password" flow.
-- The token itself is never stored in plaintext: we store a SHA-256 hash of
-- the token so that a database leak alone cannot be used to reset passwords.

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS reset_token        VARCHAR(255) NULL,
    ADD COLUMN IF NOT EXISTS reset_token_expiry TIMESTAMP    NULL;

CREATE INDEX IF NOT EXISTS idx_users_reset_token ON users (reset_token);
