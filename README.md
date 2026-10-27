# VendorBridge — Procurement & Vendor Management ERP

VendorBridge is a Week 1 implementation of a procurement and vendor-management ERP. It provides a secure starting point for vendor onboarding and administration: users can register, authenticate, access protected areas, and create, search, filter, and review vendor profiles.

## Week 1 objectives

Week 1 focuses on the application foundation rather than the complete ERP product:

- Establish persistent PostgreSQL data models and Drizzle migrations.
- Implement registration, login, logout, database-backed sessions, and protected routes.
- Deliver an initial dashboard and vendor-management workflow.
- Validate inputs on both client and server, and cover backend paths with unit tests.

The status of incomplete work is documented in [Current status and limitations](#current-status-and-limitations).

## Implemented features

### Authentication and access

- Registration through `/register`; new self-registered users are assigned the `VENDOR` role.
- Login by username or email through `/login`.
- Logout from the shared application shell.
- Database-backed sessions with a random token stored as a hash, a seven-day expiry, and an HTTP-only, SameSite cookie.
- Server-side authentication checks on the dashboard and vendor pages; unauthenticated users are redirected to `/login`.
- `GET /api/auth/me` returns the authenticated user or `401`.
- Password-reset backend endpoints:
  - `POST /api/auth/forgot-password` creates a short-lived hashed reset token for a known account while returning a generic response.
  - `POST /api/auth/reset-password` consumes a valid token, changes the password, and revokes existing sessions.

### Dashboard

- Protected dashboard shell with primary navigation and logout.
- Four Week 1 summary-card placeholders.
- Empty states for purchase orders and spending trends.
- A working **Add Vendor** quick action. Other ERP modules intentionally show a Week 1 “coming soon” state.

### Vendor management

- Create a vendor from `/vendors/new` using `POST /api/vendors`.
- List vendors at `/vendors` and review a vendor at `/vendors/[vendorId]`.
- Persistent vendor fields: vendor name, category, optional GST number, contact name, email, phone number, status, and timestamps.
- Shared Zod validation in the client form and server route. Vendor name, category, contact name, email, and phone number are required; GST number is optional.
- Duplicate GST-number handling and user-facing request errors.
- Server-side search by vendor name, GST number, or category.
- Server-side status filters for **Active**, **Pending**, and **Blocked**, plus displayed vendor status.

## Technology stack

- [Next.js 16](https://nextjs.org/) App Router and React 19
- TypeScript
- PostgreSQL via Neon serverless driver
- Drizzle ORM and Drizzle Kit
- Zod validation
- Argon2id password hashing
- Tailwind CSS and reusable UI components
- Vitest for unit tests

## Prerequisites

- Node.js compatible with the project dependencies (Node.js 20 LTS or newer is recommended).
- npm.
- A PostgreSQL database for local development. The application uses a Neon-compatible PostgreSQL connection string.

## Local installation and running

1. Install dependencies:

   ```bash
   npm install
   ```

2. Create a local environment file named `.env.local`. Use a database URL for a database you are permitted to use; see [Environment variables](#environment-variables).

3. Apply the existing development migrations:

   ```bash
   npx drizzle-kit migrate --config drizzle.config.ts
   ```

4. Start the development server:

   ```bash
   npm run dev
   ```

5. Open [http://localhost:3000](http://localhost:3000). The root route redirects to `/login`.

## Environment variables

Create `.env.local` locally; it is intentionally ignored by Git.

```dotenv
# .env.local — placeholder only; never commit a real connection string
DATABASE_URL="postgresql://USERNAME:PASSWORD@HOST:PORT/DATABASE?sslmode=require"
```

For the isolated integration-test branch, create `.env.test.local` instead:

```dotenv
# .env.test.local — placeholders only; use a dedicated, non-production test branch
TEST_DATABASE_URL="postgresql://USERNAME:PASSWORD@HOST:PORT/TEST_DATABASE?sslmode=require"
TEST_NEON_BRANCH_ID="your-isolated-neon-branch-id"
```

Never copy credentials into this README, source code, screenshots, commits, or pull requests. Do not commit `.env.local` or `.env.test.local`.

## Database and migrations

The Drizzle schema is in `src/db/schema.ts`; generated SQL migrations and snapshots are in `drizzle/`. The schema currently includes:

- `users` with the supported role enum.
- `vendors` with a `PENDING` default status and an optional unique GST number.
- `sessions` for hashed, expiring server sessions.
- `password_reset_tokens` for hashed, expiring one-time reset tokens.

### Week 2 database foundation

The forward-only Week 2 migration adds the RFQ and quotation data foundation only; it does not add RFQ UI, APIs, attachment storage, account-linking endpoints, or alter registration behavior.

- `vendor_user_memberships` links a vendor account to one vendor while allowing a vendor to have multiple accounts. Existing users and vendors are intentionally left unlinked.
- `rfqs`, `rfq_line_items`, and `rfq_vendor_assignments` model RFQs, their requested items, and assigned vendors.
- `quotations` and `quotation_line_items` model one quotation per assigned vendor/RFQ pair. Composite foreign keys ensure a quotation is for an assignment and each quoted line belongs to that quotation's RFQ.
- RFQ and quotation statuses are database enums; allowed state transitions remain application logic.
- Each RFQ has one `currency` value, shared by every quotation for that RFQ. Quotation unit prices use PostgreSQL `numeric(14,2)` (up to 12 digits before, and 2 digits after, the decimal) and Drizzle represents them as strings. Requested item quantities use `numeric(14,3)`.

### Development database

`drizzle.config.ts` loads `DATABASE_URL` from `.env.local` and uses the schema and migration directory above. After setting the placeholder-derived local value to your own authorized database URL, apply committed migrations with:

```bash
npx drizzle-kit migrate --config drizzle.config.ts
```

To create a new migration during development (only when intentionally changing the schema), use:

```bash
npx drizzle-kit generate --config drizzle.config.ts
```

### Isolated test-branch database

`drizzle.config.test.ts` is separate from the development configuration. It reads `TEST_DATABASE_URL` from `.env.test.local`; the integration setup also requires `TEST_NEON_BRANCH_ID` and verifies that the configured database is that branch.

Apply migrations to a dedicated test branch only:

```bash
npx drizzle-kit migrate --config drizzle.config.test.ts
```

Do not point either test setting at a development or production database. This repository does not run migrations automatically as part of `npm test`.

### Test procurement-officer provisioning

For manual RFQ testing, the repository provides an explicitly invoked local CLI that creates one `PROCUREMENT_OFFICER` only on the isolated branch configured by `.env.test.local`. It never reads `DATABASE_URL` or `.env.local`.

Before it can write, the CLI verifies the live Neon branch ID against `TEST_NEON_BRANCH_ID`, using the same check as integration tests. It prompts for the password without echoing it, refuses to overwrite an existing username or email, and is not exposed through the application.

```powershell
npm.cmd run provision:test-procurement-officer -- --email procurement.test@example.com --username procurement-test
```

Use a dedicated non-production test branch only. The command requires both `TEST_DATABASE_URL` and `TEST_NEON_BRANCH_ID` in `.env.test.local`, and exits before writing when the branch identity cannot be verified.

## Commands

| Task | Command |
| --- | --- |
| Start development server | `npm run dev` |
| Build production bundle | `npm run build` |
| Start built application | `npm run start` |
| Run unit tests | `npm test` |
| Watch unit tests | `npm run test:watch` |
| Run integration tests (requires the isolated test branch) | `npm run test:integration` |
| TypeScript check | `npx tsc --noEmit` |
| Lint | `npm run lint` |

## Tests

The latest local unit-test run passed **52 tests across 9 test files**. These tests cover authentication helpers and route handlers for registration, login, logout, current-user lookup, password reset, vendor creation, and the admin authorization example.

Unit tests mock persistence and do not prove a live database deployment. Integration testing is separately configured for an explicitly identified Neon test branch and should only be run after that branch is deliberately configured.

## Roles and current authorization behavior

The database role enum supports:

- `PROCUREMENT_OFFICER`
- `VENDOR`
- `MANAGER`
- `ADMIN`

Current authorization is intentionally limited and should not be read as a complete permission matrix:

- Public registration always creates a `VENDOR` account; there is no role-management UI or public role selection.
- Dashboard, vendor list, vendor detail, and add-vendor pages require any valid authenticated session.
- `POST /api/vendors` accepts a vendor creation request from **any authenticated role**. It currently checks authentication, not a role-specific permission.
- Vendor list and detail pages query all vendor records for any authenticated user. The vendor schema has no owner/creator relationship, so records are not filtered to a user’s own vendors.
- `requireRole()` exists and the `/api/admin/test` endpoint demonstrates `ADMIN`-only authorization. It is not yet applied to vendor management.
- Vendor update and delete operations do not exist, so no authorization policy exists for them.

Before broader use, define and enforce a complete role-permission matrix in every protected mutation and data-access path.

## Security notes

- Passwords are stored as Argon2id hashes, not plaintext.
- Session and password-reset tokens are stored as hashes in the database.
- Login issues an HTTP-only, SameSite session cookie; the `secure` attribute is enabled in production.
- Request schemas validate registration, login, password-reset, and vendor-creation inputs. Backend errors return generic messages rather than internal database details.
- Keep `.env.local` and `.env.test.local` local and uncommitted. Configure them from a secure secrets manager or approved local developer setup, using the variable names shown above but never sharing their values.

## Current status and limitations

### Implemented for Week 1

- Authentication routes and session lifecycle.
- Protected dashboard and vendor pages.
- Vendor create, list, and detail flows.
- Vendor form validation, database schema/migrations, search, and selected status filtering.
- Password-reset backend token lifecycle.
- Unit tests for route and authorization behavior.

### Incomplete or not yet production-ready

- Vendor update and delete UI, routes, and authorization are missing.
- A complete role-permission matrix has not been defined or enforced for vendor operations.
- Password-reset delivery is not production-complete: there is no reset-request/reset-password UI or email delivery integration. In development, a reset token may be returned for local testing only.
- Dashboard cards are placeholders and do not yet calculate live procurement metrics.
- The `INACTIVE` vendor status exists in the schema but is not offered as a list filter.
- There is no confirmed deployment URL or deployment configuration in this repository.
- The repository does not include screenshots, a recorded demo, or end-to-end browser tests.

This README reflects the code currently present in the repository and deliberately does not claim unimplemented workflows as complete.
