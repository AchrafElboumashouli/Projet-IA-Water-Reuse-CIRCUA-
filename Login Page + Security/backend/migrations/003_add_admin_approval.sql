-- Migration: 003_add_admin_approval
-- Adds support for a "pending approval" workflow for self-registered admin
-- accounts. Existing 'user' and 'guest' registrations are unaffected: their
-- approval_status is set to 'approved' by default (see below) so nothing
-- changes for them.

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS approval_status VARCHAR(20) NOT NULL DEFAULT 'approved',
    ADD COLUMN IF NOT EXISTS approved_at     TIMESTAMP    NULL,
    ADD COLUMN IF NOT EXISTS approved_by     INTEGER      NULL REFERENCES users(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS rejected_reason TEXT         NULL;

ALTER TABLE users
    DROP CONSTRAINT IF EXISTS chk_users_approval_status;

ALTER TABLE users
    ADD CONSTRAINT chk_users_approval_status
    CHECK (approval_status IN ('approved', 'pending', 'rejected'));

CREATE INDEX IF NOT EXISTS idx_users_approval_status ON users (approval_status);

-- Backfill: any row that existed before this migration is already a normal,
-- usable account, so it must be 'approved' (the column default already
-- covers newly-inserted rows, this covers any pre-existing ones explicitly).
UPDATE users SET approval_status = 'approved' WHERE approval_status IS NULL;
