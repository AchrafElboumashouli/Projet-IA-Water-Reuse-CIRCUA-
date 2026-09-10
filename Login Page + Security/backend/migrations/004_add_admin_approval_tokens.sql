-- Migration: 004_add_admin_approval_tokens
-- Adds support for one-click email approval/rejection of pending admin
-- registration requests. Only a SHA-256 hash of the token is ever stored
-- (same pattern as the password-reset token), so a database leak alone
-- cannot be used to approve/reject accounts.

CREATE TABLE IF NOT EXISTS admin_approval_tokens (
    id          SERIAL PRIMARY KEY,
    user_id     INTEGER      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash  VARCHAR(255) NOT NULL UNIQUE,
    expires_at  TIMESTAMP    NOT NULL,
    used_at     TIMESTAMP    NULL,
    created_at  TIMESTAMP    NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_admin_approval_tokens_token_hash ON admin_approval_tokens (token_hash);
CREATE INDEX IF NOT EXISTS idx_admin_approval_tokens_user_id ON admin_approval_tokens (user_id);
