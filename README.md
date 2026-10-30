# VendorBridge — Procurement & Vendor Management ERP

VendorBridge is a procurement and vendor-management ERP implemented across Week 1 and Week 2. Week 1 establishes authentication, vendor records, and protected application areas. Week 2 adds the RFQ-to-quotation workflow, authenticated RFQ attachments, vendor-scoped access, and procurement quotation comparison.

## Project Overview

The implemented workflow is:

1. A user registers as a vendor and can create a vendor profile for their organisation.
2. A Procurement Officer creates an RFQ, adds requested line items, and assigns existing vendor profiles.
3. The Procurement Officer saves the RFQ as a draft or publishes it.
4. A vendor whose membership is linked to an assigned vendor profile can view the open RFQ, its attachments, and submit a quotation.
5. A Procurement Officer reviews submitted quotations and compares their totals, delivery timelines, and notes.

## Features Implemented

### Authentication and authorization

- Registration at `/register`, login at `/login`, logout, and `GET /api/auth/me`.
- Public registration always creates a `VENDOR` user; there is no public role selector or role-management UI.
- Passwords use Argon2 hashes. Session tokens are random values stored in the browser only as HTTP-only, `SameSite=Lax` cookies; their SHA-256 hashes and seven-day expirations are persisted in PostgreSQL.
- Server-side protected pages and route handlers enforce authentication and applicable roles.
- Password-reset route handlers create one-time, hashed tokens and revoke active sessions after a successful reset. They do not send email; development responses may expose the token for local testing.
- An authenticated `ADMIN` can promote a user to `PROCUREMENT_OFFICER` through `PATCH /api/admin/users/[userId]/role`. A dedicated local CLI can provision a Procurement Officer only on the verified isolated test branch; see [Test procurement-officer provisioning](#test-procurement-officer-provisioning).
- A `vendor_user_memberships` record resolves a signed-in vendor's organisation identity. A user may belong to one vendor profile; a vendor profile can have multiple member accounts.

### Vendor management

- Procurement Officers can create vendors at `/vendors/new`, list them at `/vendors`, and view individual records at `/vendors/[vendorId]`.
- Vendor creation validates required contact details, accepts an optional unique GST number, and starts with `PENDING` status.
- The vendor list supports server-side search by vendor name, GST number, or category, and filters for Active, Pending, and Blocked statuses.
- Vendor management pages and `POST /api/vendors` are restricted to `PROCUREMENT_OFFICER`.
- A signed-in `VENDOR` without a membership can create one new self-profile at `/vendor-profile/new`. This atomically creates a pending vendor profile and its membership. A vendor with an existing membership cannot create another profile through this route.

### RFQ management

- Procurement Officers create RFQs at `/rfqs/new` with a generated unique `RFQ-YYYYMMDD-…` number.
- An RFQ has a title, product/service category, description, three-letter currency, future deadline, one or more requested line items, and one or more assigned vendors.
- RFQs are created as `DRAFT`; a Procurement Officer can publish a valid draft to `OPEN`. Publishing checks that the RFQ has a future deadline, line items, and vendor assignments.
- `/rfqs` lists all RFQs for Procurement Officers. Vendors see only their assigned, open RFQs. `/rfqs/[rfqId]` shows RFQ details, requested line items, attachments, and the appropriate procurement or vendor action.
- The route handlers use shared Zod schemas, role checks, UUID validation, and transactions for RFQ creation and publication.

### RFQ attachments

- Procurement Officers can attach files while creating an RFQ. Upload authorisation and attachment finalisation are authenticated server routes.
- Files are stored privately in ImageKit; PostgreSQL stores attachment metadata, including the RFQ, uploader, ImageKit file ID, original filename, MIME type, size, and storage path.
- Allowed file types are PDF, DOCX, XLSX, CSV, PNG, JPG, and JPEG. Each file is limited to 10 MB.
- Downloads are authenticated and proxied through a short-lived signed ImageKit URL. Procurement Officers can download attachments for any RFQ; linked vendors can download attachments only for their assigned, open RFQs.

### Vendor quotation submission

- Only a linked vendor assigned to an open RFQ can load, save, or submit a quotation for it. The vendor ID is derived from membership, never from a request payload.
- Vendors enter a unit price for requested RFQ line items, plus optional delivery timeline and notes.
- A draft needs at least one valid requested line item and can be saved and edited. Submission requires every requested line item and performs an authoritative server-side deadline check.
- Each vendor/RFQ pair has at most one persisted quotation. Submitted quotations are read-only; attempts to change them are rejected.
- Quotation unit prices use exact decimal strings (`numeric(14,2)`); requested quantities use `numeric(14,3)`.

### My Quotations

- `/my-quotations` is the vendor-specific quotation history.
- It shows draft or submitted status, associated RFQ number/title, delivery timeline, last update/submission time, and a comparable total when every requested line item is priced.
- Each entry links back to the vendor's assigned RFQ.

### Procurement quotation comparison

- `/quotations` is available to Procurement Officers and lists RFQs with submitted quotations. Each row links to `/rfqs/[rfqId]/quotations`.
- The comparison screen uses persisted submitted quotations only. It displays requested quantities, quoted unit prices, delivery timelines, and vendor notes.
- Comparable totals are calculated from requested quantities × quoted unit prices and rounded half-up to two decimal places. Complete quotations with the lowest total are highlighted.
- The client can filter by vendor name and sort by lowest comparable total, vendor name, or most recent submission. It includes empty, loading, and error states.
- Vendor rating data and rating functionality are not present.

## Technology Stack

| Area | Technology |
| --- | --- |
| Framework and UI | Next.js 16 App Router, React 19, TypeScript, Tailwind CSS v4 |
| Database | Neon PostgreSQL, Drizzle ORM, Drizzle Kit |
| Validation and security | Zod, Argon2 |
| File storage | ImageKit |
| Testing | Vitest |

## Architecture and Project Structure

```text
src/
  app/                 App Router pages and API route handlers
    api/auth/          Authentication and password-reset routes
    api/vendors/       Procurement vendor creation route
    api/vendor-profile/ Vendor self-profile route
    api/rfqs/          RFQ, attachment, quotation, and comparison routes
  components/          Application shell, forms, RFQ and quotation UI
  db/                  Neon/Drizzle client and PostgreSQL schema
  lib/                 Auth, authorisation, access control, ImageKit,
                       quotation/RFQ services, and Zod schemas
  types/               Shared TypeScript types
drizzle/               Committed SQL migrations and Drizzle snapshots
scripts/               Test-branch procurement-officer provisioning CLI
tests/unit/            Unit, route, persistence, and validation tests
tests/integration/     Isolated-Neon-branch integration-test safeguards
```

The main pages are `/dashboard`, `/vendors`, `/rfqs`, `/quotations`, and `/my-quotations`. The shared application shell routes vendor users to **My Quotations** and Procurement Officers to **Quotations**.

## Prerequisites and Installation

- Node.js 20 LTS or later (recommended)
- npm
- A permitted Neon-compatible PostgreSQL database
- An ImageKit account and keys if RFQ attachments will be used

1. Clone the repository and enter it.

   ```bash
   git clone <repository-url>
   cd VendorBridge-X-Kagnus
   ```

2. Install dependencies.

   ```bash
   npm install
   ```

3. Create `.env.local` using the placeholders in [Environment Variables](#environment-variables).

4. Apply the committed development migrations.

   ```bash
   npx drizzle-kit migrate --config drizzle.config.ts
   ```

5. Start the development server.

   ```bash
   npm run dev
   ```

Open [http://localhost:3000](http://localhost:3000). The root route redirects to `/login`.

## Environment Variables

`.env.local` and `.env.test.local` are ignored by Git. Use approved, non-production credentials where appropriate and never commit real values.

### Application configuration (`.env.local`)

```dotenv
# Required for the application database connection
DATABASE_URL="postgresql://USERNAME:PASSWORD@HOST:PORT/DATABASE?sslmode=require"

# Required when using RFQ attachment upload or download
IMAGEKIT_PUBLIC_KEY="public_key_placeholder"
IMAGEKIT_PRIVATE_KEY="private_key_placeholder"
IMAGEKIT_URL_ENDPOINT="https://ik.imagekit.io/your_imagekit_id"
```

`DATABASE_URL` is read by the application and the development Drizzle configuration. The three ImageKit settings are read only when attachment operations need them; attachment upload returns a configuration error when they are absent.

### Isolated integration-test branch (`.env.test.local`)

```dotenv
TEST_DATABASE_URL="postgresql://USERNAME:PASSWORD@HOST:PORT/TEST_DATABASE?sslmode=require"
TEST_NEON_BRANCH_ID="your-isolated-neon-branch-id"
```

Both test variables are required for integration tests and the test procurement-officer CLI. The integration setup verifies the live `neon.branch_id` before it proceeds. Do not use a development or production database for these values.

## Database and Migrations

`src/db/schema.ts` is the current Drizzle schema. Its main relationships are:

- `users` holds account identity and the `user_role` enum.
- `vendors` holds vendor profile and status data; `vendor_user_memberships` associates a user with one vendor profile.
- `rfqs` belongs to its creating user and has line items, vendor assignments, and attachments.
- `quotations` is unique per RFQ/vendor assignment; `quotation_line_items` is constrained to line items belonging to the quotation's RFQ.
- `sessions` and `password_reset_tokens` persist only token hashes and expirations.

The committed migration journal contains the following migrations:

| Migration | Purpose |
| --- | --- |
| `0000_easy_virginia_dare.sql` | Temporary initial test table, removed by the next migration |
| `0001_jazzy_peter_quill.sql` | Users and role enum |
| `0002_careless_spot.sql` | Vendors and vendor status enum |
| `0003_equal_charles_xavier.sql` | Database-backed sessions |
| `0004_noisy_nitro.sql` | Password-reset tokens |
| `0005_cooing_vision.sql` | Week 2 RFQ, assignment, membership, quotation, line-item tables and enums |
| `0006_broad_iron_man.sql` | Unique RFQ numbers, including legacy backfill |
| `0007_graceful_union_jack.sql` | RFQ attachment metadata and indexes |
| `0008_rfq_categories.sql` | Required RFQ category, backfilled as `Other` for existing rows |
| `0009_quotation_delivery_and_notes.sql` | Quotation delivery timeline and notes |

Apply development migrations with:

```bash
npx drizzle-kit migrate --config drizzle.config.ts
```

To apply the same committed migrations to the intentionally isolated test branch:

```bash
npx drizzle-kit migrate --config drizzle.config.test.ts
```

The repository does not run migrations automatically as part of `npm test` or `npm run test:integration`.

### Test procurement-officer provisioning

For local RFQ testing, use the explicit CLI only with the isolated branch configured in `.env.test.local`:

```powershell
npm.cmd run provision:test-procurement-officer -- --email procurement.test@example.com --username procurement-test
```

It prompts for a password without echoing it, refuses duplicate username/email values, verifies the live Neon branch against `TEST_NEON_BRANCH_ID`, and never reads `DATABASE_URL`.

## Role-Based Access Control

| Role | Implemented access |
| --- | --- |
| `VENDOR` | Publicly assigned at registration. A linked vendor sees only assigned open RFQs, their permitted attachments, and its own quotations; it can create one self-profile only while unlinked. |
| `PROCUREMENT_OFFICER` | Creates, lists, and views vendors; creates and publishes RFQs; manages RFQ attachments; views RFQs and submitted-quotation comparisons. |
| `MANAGER` | Stored in the role enum, but no dedicated procurement or vendor workflow is implemented for it. |
| `ADMIN` | `requireRole()` and the example admin test route exist; the implemented user-role mutation is promotion to `PROCUREMENT_OFFICER`. No role-management UI exists. |

Public signup cannot choose a higher-level role. Vendor membership—not a client-provided vendor identifier—determines which RFQs and quotations a vendor can access.

## Testing and Validation

The test configuration separates unit and integration projects:

| Task | Command |
| --- | --- |
| Start development server | `npm run dev` |
| Build production bundle | `npm run build` |
| Start production bundle | `npm run start` |
| Run unit tests | `npm test` |
| Watch unit tests | `npm run test:watch` |
| Run integration tests (isolated branch required) | `npm run test:integration` |
| Type check | `npx tsc --noEmit` |
| Lint | `npm run lint` |

The unit suite covers authentication helpers and route handlers, role checks, vendor profile and vendor-management routes/pages, RFQ creation/detail/publication/access, ImageKit attachment authorisation/linking/downloading, quotation validation/persistence/routes, My Quotations persistence, quotation comparison, and test-branch provisioning safeguards. The latest local run completed successfully with **156 tests in 38 test files**.

Integration testing reads only `.env.test.local` and validates its configured Neon branch ID before database access. It does not apply migrations automatically.

## Known Limitations and Scope

- Email delivery and notification workflows are not implemented. Public registration does not add email verification, and password-reset routes do not send reset email.
- RFQ status values include `CLOSED` and `CANCELLED`, but this implementation provides draft creation and publishing to `OPEN`; no close, cancel, or RFQ-edit workflow is exposed.
- Vendor update/delete operations and a general role-management UI are not implemented.
- Vendors cannot associate themselves with an existing vendor profile through an application endpoint; the self-onboarding flow creates a new pending profile and membership.
- Submitted quotations are intentionally immutable. Draft quotations remain editable.
- Selecting a quotation on the comparison screen is session-only client state; Week 3 approval/selection persistence is not implemented.
- Vendor ratings are unavailable.
- Dashboard cards and later ERP modules (approvals, purchase orders, invoices, reports, and activity) remain outside the implemented Week 2 scope.
- No deployment URL, screenshots, or recorded demonstration are included in this repository.

## Week 2 Workflow

### As a Procurement Officer

1. Sign in with a `PROCUREMENT_OFFICER` account.
2. Create or review vendor profiles at `/vendors`.
3. Go to `/rfqs/new`, enter RFQ details and line items, select vendors, and optionally add supported attachments.
4. Save a draft or publish it. Publishing makes the RFQ available to its assigned vendors; it does not send notifications.
5. Review submitted quotations at `/quotations`, then open an RFQ comparison to filter, sort, and compare offers.

### As a Vendor

1. Register at `/register` and sign in.
2. If the account has no membership, create a pending organisation profile at `/vendor-profile/new`, or obtain the appropriate membership outside this self-service flow.
3. Open `/rfqs` to view only RFQs assigned to the linked vendor profile.
4. Open an RFQ, download permitted attachments, enter unit prices, delivery timeline, and notes, then save a draft or submit before the deadline.
5. Review the vendor's history at `/my-quotations`. Submitted quotations cannot be edited.

## Project Status

The Week 1 foundation—authentication, sessions, protected navigation, and vendor records—and the Week 2 RFQ, attachment, quotation, and comparison workflows are implemented. Week 3 approval persistence and later procurement modules are not claimed as complete.
