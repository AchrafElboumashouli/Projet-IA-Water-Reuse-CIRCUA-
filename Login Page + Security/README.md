# Smart Water Quality Monitoring --- Authentication & Security

## Overview

This repository contains the standalone authentication and
user-management module of the Smart Water Quality Monitoring system.

The module is deliberately decoupled from the business application and
is responsible for identity, authentication, authorization, account
management, password recovery, and administrator-account approval.

It uses a three-tier architecture:

``` text
React 18 + Vite
       |
       | Axios / REST / httpOnly cookies
       v
Node.js + Express
       |
       | Parameterized SQL
       v
PostgreSQL

Nodemailer / SMTP
       |
       +--> Password-reset emails
       +--> Administrator approval/rejection emails
```

## Main Features

-   User registration with strict server-side validation.
-   Login with email or username.
-   JWT authentication using access and refresh tokens.
-   JWT transport through `httpOnly` cookies.
-   Role-Based Access Control with `admin`, `user`, and `guest`.
-   Server-side authorization with `requireAuth` and `requireRole`.
-   Password reset using single-use, time-limited tokens.
-   Administrator self-registration protected by human approval.
-   Approval/rejection from the admin dashboard or directly from an
    email.
-   User search, pagination, role changes, activation/deactivation, and
    deletion.
-   Rate limiting on sensitive routes.
-   Account-enumeration protection on password recovery.
-   SQL injection protection through parameterized queries.
-   HTML escaping for user-controlled values inserted into email
    templates.
-   PostgreSQL transactions and row locking for critical operations.
-   SMTP support through Nodemailer, with optional HTTP/SOCKS5 proxy
    routing.
-   Versioned, idempotent database migrations.
-   `/api/health` health-check endpoint.

## Technology Stack

  Layer               Technology           Purpose
  ------------------- -------------------- -------------------------------
  Frontend            React 18             User interface
  Build               Vite                 Frontend development/build
  Routing             React Router v6      Client navigation
  HTTP                Axios                Frontend/API communication
  State               React Context API    Authentication state
  Backend             Node.js              Runtime
  API                 Express.js           REST API
  Database            PostgreSQL 13+       Persistence
  Authentication      JWT                  Access/refresh authentication
  Password security   bcrypt               Password hashing
  Validation          express-validator    Input validation
  Rate limiting       express-rate-limit   Abuse protection
  Email               Nodemailer           SMTP delivery
  Cryptography        Node.js `crypto`     Secure random tokens

## Architecture

The backend is organized in five layers:

``` text
HTTP Request
     |
     v
Routes
     |
     v
Middleware
(auth / authorization / validation / rate limiting)
     |
     v
Controllers
     |
     v
Services
(JWT / bcrypt / token generation / email)
     |
     v
Models / Data Access
(parameterized SQL)
     |
     v
PostgreSQL
```

### Backend responsibilities

-   `routes/`: API endpoints, validation and rate-limit composition.
-   `middleware/`: authentication, role authorization and validation
    handling.
-   `controllers/`: request orchestration and HTTP responses.
-   `services/`: reusable security and business logic.
-   `models/`: PostgreSQL access through parameterized SQL.
-   `config/`: database pool configuration.
-   `migrations/`: versioned SQL schema changes.
-   `server.js`: Express entry point, global middleware, routers, health
    check and error handling.
-   `smtp_diagnose.js`: SMTP connectivity/authentication/delivery
    diagnostic tool.

### Frontend responsibilities

-   `components/`: Login, registration, password recovery/reset,
    navigation and reusable UI components.
-   `context/`: `AuthContext`, which manages the current authentication
    state.
-   `pages/`: Login, Register, dashboards, profile, administration and
    error pages.
-   `routes/`: `ProtectedRoute` and `RoleProtectedRoute`.
-   `services/`: Axios API client plus authentication/user services.

## Authentication

The system issues two JWTs:

  Token             Default lifetime Purpose
  --------------- ------------------ -----------------------------------
  Access token                15 minutes API authentication
  Refresh token               7 days Longer-lived authentication token

The secrets are separate:

``` env
JWT_SECRET=
JWT_REFRESH_SECRET=
```

Tokens are placed in `httpOnly` cookies. The cookie configuration uses
`sameSite=lax`, with `secure=true` in production. The access token is
also returned in the JSON response for clients that prefer an
`Authorization: Bearer` header.

### Authentication flow

``` text
Login request
     |
     v
Validate input
     |
     v
Find user
     |
     v
Check approval status
     |
     v
Check active status
     |
     v
bcrypt.compare()
     |
     v
Generate access + refresh JWTs
     |
     v
Set httpOnly cookies
     |
     v
Authenticated user
```

`GET /api/auth/me` reloads the current user from the backend and is used
by the frontend to restore an existing session.

## Registration

Endpoint:

``` text
POST /api/auth/register
```

The registration form collects:

-   Full name
-   Username
-   Email
-   Password
-   Password confirmation
-   Requested role

Validation rules include:

-   Full name: 2--150 characters.
-   Username: 3--50 characters, limited to letters, numbers, `_`, `.`
    and `-`.
-   Email: valid and normalized.
-   Password: at least 8 characters, including at least one uppercase
    letter and one digit.
-   Password confirmation must match.

Duplicate email/username registration is rejected with HTTP `409`.

### User and guest accounts

`user` and `guest` accounts are created as approved accounts and can
authenticate immediately.

### Administrator accounts

When `ENFORCE_SAFE_PUBLIC_ROLES=true` (the default), an administrator
request is created as:

``` text
approval_status = pending
is_active = false
```

The account cannot log in until an existing administrator approves it.

## Login

Endpoint:

``` text
POST /api/auth/login
```

The identifier can be either an email address or username.

The backend checks:

1.  Account existence.
2.  Approval status.
3.  Active status.
4.  Password using `bcrypt.compare()`.

Pending/rejected accounts are refused with HTTP `403`. Invalid
credentials use the generic `Invalid credentials` message.

On success, `last_login` is updated, JWTs are issued, cookies are set,
and public user information is returned without the password hash.

## Logout

Endpoint:

``` text
POST /api/auth/logout
```

Logout clears:

``` text
access_token
refresh_token
```

The access-token model is stateless; no server-side session object is
required.

## Role-Based Access Control

Supported roles:

``` text
admin
user
guest
```

Backend authorization uses:

``` text
requireAuth
requireRole(...roles)
```

`requireAuth` validates the access token and then reloads the user from
PostgreSQL. This means the current role and active status are taken from
the database rather than trusted only from the JWT.

Consequently, disabling a user or changing their role can be enforced
even while an older JWT is still valid.

The frontend uses:

``` text
ProtectedRoute
RoleProtectedRoute
```

For example, `/admin/users` is restricted to administrators.
Unauthorized frontend navigation is redirected to `/unauthorized`.

The frontend guards are not the security boundary: authorization is
always rechecked by the backend.

## Administrator Approval

The administrator-registration workflow prevents unrestricted privilege
escalation.

### Configuration

``` env
ENFORCE_SAFE_PUBLIC_ROLES=true
DEFAULT_PUBLIC_ROLE=user
```

When safe-role enforcement is enabled, admin requests remain pending
until human approval.

When it is disabled, an attempted public admin role is replaced by the
configured default public role; this mode is intended for local
demonstration/testing.

### Dashboard approval

Pending requests are available through:

``` text
GET  /api/users/admin-requests/pending
POST /api/users/admin-requests/:id/approve
POST /api/users/admin-requests/:id/reject
```

Approval activates the account and records:

-   `approved_by`
-   `approved_at`

Rejection keeps the account inactive and may record a rejection reason.

### Email approval

Approval/rejection links are exposed through:

``` text
GET /api/admin-registration/approve
GET /api/admin-registration/reject
```

These endpoints do not require a browser session because the email
itself contains the security token.

Approval tokens:

-   contain 32 random bytes;
-   are generated with Node.js `crypto`;
-   are sent in the email;
-   are stored only as SHA-256 hashes;
-   expire after 24 hours;
-   are single-use.

Processing uses a PostgreSQL transaction with `SELECT ... FOR UPDATE`,
preventing concurrent double processing.

After processing, the backend displays a dynamically generated HTML
result page.

## Password Recovery

### Request reset

``` text
POST /api/auth/forgot-password
```

For an existing account, the server generates a random token, stores its
SHA-256 hash with a 15-minute expiration, invalidates the previous reset
token, and sends a reset link:

``` text
${FRONTEND_URL}/reset-password/:token
```

The response is deliberately identical whether the email exists, does
not exist, or an unexpected internal error occurs. This prevents account
enumeration.

### Reset password

``` text
POST /api/auth/reset-password
```

The server:

1.  Hashes the supplied token with SHA-256.
2.  Finds the matching user/token.
3.  Checks expiration.
4.  Hashes the new password with bcrypt.
5.  Updates the password.
6.  Invalidates the token.

The password update and token invalidation occur in one transaction,
preventing concurrent token reuse.

## Security Controls

### Password hashing

Passwords are never stored in plaintext.

``` text
bcrypt — 12 salt rounds
```

### Rate limiting

  Route/function                               Limit
  -------------------------------- -----------------
  Login                              10 / 15 minutes
  Registration                             20 / hour
  Forgot password                     5 / 15 minutes
  Reset password                     10 / 15 minutes
  Admin approval/rejection links     30 / 15 minutes

### SQL injection protection

All SQL queries use PostgreSQL parameters such as `$1`, `$2`, etc.,
instead of string concatenation.

### HTML injection protection

User-controlled values inserted into HTML email templates are escaped
with `escapeHtml`.

### Account enumeration protection

The forgot-password endpoint always returns the same generic result.

### Privilege separation

Normal users may modify permitted profile fields such as:

-   full name;
-   username;
-   email.

Role and active-status changes are administrator-controlled. Attempts by
non-admin users to change these fields are rejected with HTTP `403`.

### Environment-based secrets

JWT secrets, PostgreSQL credentials and SMTP credentials are loaded from
environment variables and must never be committed to the repository.

## Email System

Email delivery uses:

``` text
Nodemailer → SMTP
```

The system sends four main email types:

1.  Password-reset email.
2.  New administrator registration request.
3.  Administrator approval confirmation.
4.  Administrator rejection confirmation.

Emails contain both HTML and plain-text versions.

The HTML templates follow the Smart Water Quality Monitoring visual
identity.

SMTP configuration:

``` env
SMTP_HOST=
SMTP_PORT=
SMTP_USER=
SMTP_PASSWORD=
SMTP_FROM=
SMTP_PROXY=
```

`SMTP_PROXY` can optionally route SMTP traffic through an HTTP or SOCKS5
proxy.

The project includes:

``` text
smtp_diagnose.js
PROXY_SETUP.md
```

The diagnostic script tests TCP connectivity, SMTP authentication and
actual email delivery.

## Database

The module uses PostgreSQL 13+.

Main tables:

### `users`

Stores account and authentication data, including identity information,
password hash, role, active status, timestamps, login information,
password-reset information and administrator-approval information.

### `admin_approval_tokens`

Stores SHA-256 hashes of administrator approval tokens, expiration/use
information and the associated user. The user relation uses
`ON DELETE CASCADE`.

### `schema_migrations`

Tracks applied migrations.

Migrations are versioned SQL files and are applied in alphabetical order
by `migrations/migrate.js`. Applied versions are recorded in
`schema_migrations`, making repeated migration execution idempotent.

Critical operations use PostgreSQL:

``` text
BEGIN
COMMIT
ROLLBACK
```

and administrator-token processing uses row locking.

## API Reference

All API routes are prefixed with:

``` text
/api
```

### Authentication

  Method   Endpoint                      Description
  -------- ----------------------------- --------------------------------
  POST     `/api/auth/register`          Create account
  POST     `/api/auth/login`             Authenticate
  POST     `/api/auth/logout`            Clear authentication cookies
  GET      `/api/auth/me`                Get current authenticated user
  POST     `/api/auth/forgot-password`   Request password reset
  POST     `/api/auth/reset-password`    Reset password

### Users

  -----------------------------------------------------------------------------------------
  Method                  Endpoint                                  Description
  ----------------------- ----------------------------------------- -----------------------
  GET                     `/api/users`                              User/account
                                                                    administration

  GET                     `/api/users/:id`                          Retrieve user

  PATCH                   `/api/users/:id`                          Modify permitted
                                                                    account data

  DELETE                  `/api/users/:id`                          Delete user

  GET                     `/api/users/admin-requests/pending`       List pending admin
                                                                    requests

  POST                    `/api/users/admin-requests/:id/approve`   Approve admin request

  POST                    `/api/users/admin-requests/:id/reject`    Reject admin request
  -----------------------------------------------------------------------------------------

### Email approval

  Method   Endpoint                            Description
  -------- ----------------------------------- ---------------------------
  GET      `/api/admin-registration/approve`   Approve using email token
  GET      `/api/admin-registration/reject`    Reject using email token

### Health

``` text
GET /api/health
```

Returns service status and timestamp and can be used for
monitoring/deployment checks.

## Frontend Pages and Components

### Components

-   `LoginForm`
-   `RegisterForm`
-   `ForgotPasswordForm`
-   `ResetPasswordForm`
-   `PasswordInput`
-   `Navbar`
-   `AuthIllustration`

Authentication forms perform client-side validation and handle server
errors.

### Pages

-   `LoginPage`
-   `RegisterPage`
-   `DashboardRouter`
-   `AdminDashboard`
-   `UserDashboard`
-   `GuestDashboard`
-   `AdminUsersPage`
-   `UserProfile`
-   `Unauthorized`
-   `NotFound`

`DashboardRouter` selects the dashboard according to the authenticated
user's role.

`AdminUsersPage` provides search, pagination, role changes,
activation/deactivation and deletion with confirmation.

`AdminDashboard` contains the pending administrator-request panel.

`UserProfile` manages the authenticated user's permitted personal
information.

## Environment Variables

Backend configuration is supplied through `.env` and documented by
`.env.example`.

``` env
PORT=
NODE_ENV=

DB_HOST=
DB_PORT=
DB_NAME=
DB_USER=
DB_PASSWORD=

JWT_SECRET=
JWT_EXPIRES_IN=
JWT_REFRESH_SECRET=
JWT_REFRESH_EXPIRES_IN=

COOKIE_SECURE=
FRONTEND_ORIGIN=

ENFORCE_SAFE_PUBLIC_ROLES=
DEFAULT_PUBLIC_ROLE=

ADMIN_APPROVAL_EMAIL=
SUPPORT_EMAIL=
FRONTEND_URL=
BACKEND_URL=

SMTP_HOST=
SMTP_PORT=
SMTP_USER=
SMTP_PASSWORD=
SMTP_FROM=
SMTP_PROXY=
```

Frontend:

``` env
VITE_API_URL=
```

Never place real secrets in this README or commit `.env`.

## Installation

### Requirements

-   Node.js 18+
-   PostgreSQL 13+
-   Valid SMTP account for transactional email functionality

### Database

``` bash
createdb auth_app_db
```

### Backend

``` bash
cd backend
npm install
cp .env.example .env
```

Configure the environment variables, then:

``` bash
npm run migrate
npm run dev
```

For a normal start:

``` bash
npm start
```

### Frontend

``` bash
cd frontend
npm install
cp .env.example .env
npm run dev
```

Set `VITE_API_URL` to the backend API URL.

## Validation

The current project does not contain an automated test suite. No Jest,
Mocha, Supertest or equivalent framework is declared and no dedicated
test directory is present.

Validation was performed manually through functional scenarios covering:

-   valid registration;
-   duplicate email/username;
-   password-policy failures;
-   admin registration and pending status;
-   login success/failure;
-   pending/rejected accounts;
-   logout;
-   password reset;
-   reset-token reuse;
-   expired reset tokens;
-   dashboard admin approval/rejection;
-   email approval/rejection;
-   expired/used approval links;
-   non-admin access to protected routes;
-   unauthorized role/status modifications;
-   rate-limit thresholds;
-   account-enumeration protection.

## Known Limitations

The current implementation has these limitations:

1.  No automated unit, integration or end-to-end tests.
2.  No immediate blacklist/revocation mechanism for already-issued
    access tokens.
3.  No email ownership verification during normal registration.
4.  No persistent audit-history table for all administrative actions.
5.  No two-factor authentication.
6.  No `/api/auth/refresh` endpoint and no automatic frontend
    access-token renewal, despite issuing a refresh token.

## Future Improvements

Recommended improvements include:

-   Add unit/integration/end-to-end tests.
-   Integrate API tests with Supertest and CI.
-   Add `/api/auth/refresh`.
-   Add mandatory email verification.
-   Add a dedicated administrative audit-log table.
-   Add 2FA, especially for administrators.
-   Consider transactional email providers such as SendGrid, Mailgun or
    Postmark.

## Development Challenges and Solutions

### SMTP restrictions

Direct SMTP connections were blocked by local proxy/network
configuration.

Solution:

-   `smtp_diagnose.js` isolates TCP, authentication and delivery
    problems.
-   `SMTP_PROXY` supports HTTP/SOCKS5 routing.
-   `PROXY_SETUP.md` documents the configuration.

### Administrator privilege escalation

Public users cannot immediately obtain administrator privileges when
safe-role enforcement is enabled.

Solution:

``` text
Admin registration
      ↓
pending + inactive
      ↓
Human approval
      ↓
approved + active
```

### Approval-token double processing

Email links can be clicked more than once or preloaded by email-security
systems.

Solution:

``` text
Single-use token
      +
PostgreSQL transaction
      +
SELECT ... FOR UPDATE
```

### Account enumeration

The password-reset endpoint uses the same response for existing and
non-existing accounts.

## Integration with Smart Water Quality Monitoring

This module is the identity and access-control layer of the larger Smart
Water Quality Monitoring system.

``` text
Smart Water Quality Monitoring
│
├── Authentication & Security
│   ├── React Frontend
│   ├── Node.js / Express Backend
│   ├── PostgreSQL
│   └── SMTP
│
└── Protected Business Features
    ├── Water Quality Monitoring
    ├── Data Processing
    ├── Analysis / Prediction
    └── Other Application Modules
```

The module can be deployed independently provided that PostgreSQL and
SMTP infrastructure are available.

## Security Threat Model

  Threat                            Mitigation
  --------------------------------- ---------------------------------------
  Password database leak            bcrypt hashing
  Brute-force login                 Rate limiting
  Reset-token database leak         SHA-256 token hashing
  Reset-token reuse                 Single-use token + transaction
  Approval-token reuse              Single-use token + row locking
  Admin privilege escalation        Approval workflow + RBAC
  Access to disabled users          Current user reloaded from database
  Stale JWT role                    Role read from current database state
  SQL injection                     Parameterized queries
  HTML injection in emails          HTML escaping
  Account enumeration               Generic forgot-password response
  Source-code credential exposure   Environment variables
  SMTP network restrictions         Optional proxy support

## Implementation Notes

This documentation describes the implemented module rather than treating
future recommendations as existing functionality.

The most important security characteristics are:

-   bcrypt with 12 rounds for passwords;
-   access and refresh JWTs;
-   `httpOnly`, `sameSite=lax` cookies;
-   server-side RBAC;
-   current-user reload from PostgreSQL during authorization;
-   SHA-256 storage of sensitive one-time tokens;
-   15-minute reset-token expiration;
-   24-hour administrator-approval-token expiration;
-   rate limiting on sensitive routes;
-   account-enumeration protection;
-   parameterized SQL;
-   HTML escaping in emails;
-   transactional processing of critical operations;
-   optional SMTP proxy routing.

## License

Add the project's applicable license here if one has been defined in the
repository.

## Conclusion

The Authentication & User Management Module provides the security
foundation for the Smart Water Quality Monitoring platform.

It combines authentication, authorization, secure password handling,
role management, administrator approval, password recovery, user
administration, transactional email, database transactions and abuse
protections in a standalone architecture.

The module is designed to be reusable and independently deployable while
remaining suitable for integration with the broader Smart Water Quality
Monitoring application.
