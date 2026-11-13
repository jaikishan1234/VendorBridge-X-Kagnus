# VendorBridge

VendorBridge is a role-scoped procurement and vendor-management application. It supports vendor onboarding, RFQs, quotations, approvals, purchase orders, invoices, activity history, in-app notifications, reports, and purchase-order CSV export.

## Technology stack

| Area | Technology |
| --- | --- |
| Application | Next.js 16 App Router, React 19, TypeScript |
| UI | Tailwind CSS v4, shadcn/Base UI, system-font fallbacks |
| Database | PostgreSQL-compatible Neon connection, Drizzle ORM/Kit |
| Security | Argon2, HTTP-only session cookies, Zod |
| Attachments | ImageKit private storage and signed URLs |
| Documents and email | PDFKit and Nodemailer |
| Testing | Vitest |

## Procurement lifecycle

1. A public user registers as a Vendor and may create one vendor self-profile while unlinked.
2. A Procurement Officer creates vendors and RFQs, assigns vendors, and publishes valid drafts.
3. Assigned linked vendors view open RFQs, permitted attachments, and save or submit one quotation.
4. A Procurement Officer compares submitted quotations and creates an approval request.
5. A Manager approves or rejects the request with required remarks.
6. A Procurement Officer generates one purchase order from an approved request and one invoice from that PO.
7. Authorized users view permitted POs/invoices and download invoice PDFs.

## Authentication and role-based access

Passwords are Argon2 hashes. Session tokens are random values stored in HTTP-only, `SameSite=Lax` cookies; only their SHA-256 hashes and expiry are stored in PostgreSQL. Password-reset tokens are one-time hashed records. Password-reset email delivery is not implemented.

Public registration has no role selector. The server explicitly inserts `role: "VENDOR"`, which is required for the current migration 0016 demo baseline because `users.role` is non-null with no database default.

| Role | Implemented access |
| --- | --- |
| `VENDOR` | Creates one self-profile while unlinked; sees only assigned open RFQs, permitted attachments, its own quotations, POs, invoices, activity, and notifications. |
| `PROCUREMENT_OFFICER` | Manages vendors, RFQs, attachments, comparisons, approval requests, POs, invoices, reports, activity, notifications, and PO CSV export. |
| `MANAGER` | Reads and decides approval requests; sees approval-related activity and its own notifications. |
| `ADMIN` | No role-management UI. `PATCH /api/admin/users/[userId]/role` intentionally returns **410 Gone**. |

Vendor identity is derived from `vendor_user_memberships`, never from a client-supplied user or vendor ID.

## Core features

### Vendors, RFQs, and quotations

- Procurement Officers create, search, filter, and view vendors. New vendors start as `PENDING`; GST number is optional and unique when supplied.
- RFQs contain category, description, currency, future deadline, line items, and vendor assignments. They are created as `DRAFT` and validated before publishing to `OPEN`.
- Attachments support PDF, DOCX, XLSX, CSV, PNG, JPG, and JPEG up to 10 MB. ImageKit is required only for attachment operations.
- Linked assigned vendors can save quotation drafts and submit complete quotations before the deadline. Submitted quotations are immutable.
- Procurement comparison uses persisted submissions, delivery timelines, notes, and comparable totals from requested quantity × quoted unit price.

### Approvals, POs, and invoices

- Approval requests originate from submitted quotations. Manager decisions transition only from `PENDING` to `APPROVED` or `REJECTED` and retain immutable history.
- A single generated PO can originate only from an approved request. A single invoice can originate only from a PO.
- PO and invoice line items/totals are persisted snapshots. Invoice PDF rendering uses those persisted snapshots and does not recalculate totals.
- Invoice PDF download is authorized and uses the Node.js runtime. Printing uses the browser's PDF print flow; there is no separate print API.
- Invoice email is Procurement Officer–only, attaches the PDF, and sends only to the persisted vendor email.

### Activity timeline and notifications

`activity_events` is append-only. `/activity` shows real persisted events in reverse chronological order with actor and procurement-record context where available.

- Procurement Officers see procurement activity.
- Managers see approval activity.
- Vendors see their vendor-linked events and RFQs published to their assigned vendor profile.

Notifications are **in-app only**; no notification email is sent. They are created transactionally from workflow events and protected from duplicates by the database `(activity_event_id, recipient_user_id)` constraint plus server-side recipient deduplication.

| Event | Recipients |
| --- | --- |
| Published RFQ | Members of assigned vendor profiles |
| Submitted quotation | Procurement Officers |
| Approval request | Managers |
| Approval decision | Selecting Procurement Officer and affected vendor members |
| Generated PO or invoice | Affected vendor members |

`/notifications` lists only the authenticated user's notifications. `PATCH /api/notifications/[notificationId]/read` cannot mark another user's notification, and `/api/notifications/unread-count` drives the header badge.

### Reports and CSV export

`/reports` and its APIs are available only to Procurement Officers. Reports use persisted records and include:

- Total/open RFQs, active vendors, submitted quotations, generated POs, and generated invoices.
- Generated PO and invoice values, grouped separately by currency.
- Monthly generated-PO trends, grouped by month and currency.
- Vendor RFQ participation, submitted quotation counts, PO awards, and generated PO value by currency.

These are generated-document values, **not paid spending**. The project has no payment tracking, payment analytics, vendor ratings, delivery performance, quality scores, or savings data. Currencies are never combined.

Purchase order export:

```text
GET /api/reports/purchase-orders.csv
```

The route is Procurement Officer–authorized, returns `text/csv; charset=utf-8`, correctly escapes commas/quotes/newlines, and returns headers for an empty result.

## Pages

| Page | Purpose |
| --- | --- |
| `/dashboard` | Role-aware dashboard actions |
| `/vendors`, `/vendors/new`, `/vendors/[vendorId]` | Procurement vendor management |
| `/rfqs`, `/rfqs/new`, `/rfqs/[rfqId]` | RFQ list, creation, detail, and publication |
| `/my-quotations` | Vendor quotation history |
| `/quotations`, `/rfqs/[rfqId]/quotations` | Procurement quotation comparison |
| `/approvals`, `/approvals/[approvalId]` | Manager approval workflow |
| `/purchase-orders`, `/purchase-orders/[poId]` | Authorized POs and invoice generation |
| `/invoices`, `/invoices/[invoiceId]` | Authorized invoices, PDF, and email action |
| `/activity`, `/notifications` | Authorized activity and in-app notifications |
| `/reports` | Procurement Officer reports and CSV export |

## API overview

All handlers validate and authorize server-side. Dynamic identifiers are UUID-validated where applicable.

| Method | Route | Purpose |
| --- | --- | --- |
| `POST` | `/api/auth/register` | Register server-assigned Vendor |
| `POST` | `/api/auth/login`, `/api/auth/logout` | Session management |
| `GET` | `/api/auth/me` | Current user |
| `POST` | `/api/auth/forgot-password`, `/api/auth/reset-password` | Password reset flow |
| `POST` | `/api/vendors` | Create vendor |
| `POST` | `/api/vendor-profile` | Create self-profile/membership |
| `POST` | `/api/rfqs` | Create RFQ |
| `POST` | `/api/rfqs/[rfqId]/publish` | Publish RFQ |
| `POST`, `DELETE` | `/api/rfqs/[rfqId]/attachments` | Finalize/remove attachment |
| `POST` | `/api/rfqs/[rfqId]/attachments/upload-auth` | Attachment upload authorization |
| `GET` | `/api/rfqs/[rfqId]/attachments/[attachmentId]/download` | Authorized attachment download |
| `GET`, `POST`, `PUT` | `/api/rfqs/[rfqId]/quotation` | Read/save quotation draft |
| `POST` | `/api/rfqs/[rfqId]/quotation/submit` | Submit quotation |
| `GET` | `/api/rfqs/[rfqId]/quotations/comparison` | Comparison data |
| `POST` | `/api/rfqs/[rfqId]/quotations/[quotationId]/approval` | Request approval |
| `GET` | `/api/approvals`, `/api/approvals/[approvalId]` | Approval reads |
| `POST` | `/api/approvals/[approvalId]/decision` | Manager decision |
| `GET`, `POST` | `/api/purchase-orders` | List/generate POs |
| `GET` | `/api/purchase-orders/[poId]` | PO detail |
| `GET`, `POST` | `/api/invoices` | List/generate invoices |
| `GET` | `/api/invoices/[invoiceId]` | Invoice detail |
| `GET` | `/api/invoices/[invoiceId]/pdf` | Invoice PDF |
| `POST` | `/api/invoices/[invoiceId]/email` | Submit invoice email to SMTP |
| `GET` | `/api/activity` | Activity timeline |
| `GET` | `/api/notifications` | Current user's notifications |
| `PATCH` | `/api/notifications/[notificationId]/read` | Mark own notification read |
| `GET` | `/api/notifications/unread-count` | Unread count |
| `GET` | `/api/reports` | Procurement analytics |
| `GET` | `/api/reports/purchase-orders.csv` | PO CSV export |

## Database architecture and migration status

`src/db/schema.ts` models users/sessions/reset tokens, vendors and memberships, RFQs and line items/assignments/attachments, quotations and lines, approvals/history, POs and lines, invoices and lines, invoice-email records, activity events, and notifications.

Key constraints include one quotation per RFQ/vendor assignment, one PO per approval/quotation, one invoice per PO, unique vendor membership per user, append-only activity events, and unique notification event/recipient rows.

### Approved demo baseline

The development/demo database baseline is **migration 0016** (`0016_invoice_email_delivery_claims.sql`). It includes activity/notification tables from 0014, invoice generator attribution from 0015, and invoice-email claim records from 0016.

Migrations **0017** (`invoice_email_delivery_state_machine`) and **0018** (`users_role_vendor_default`) exist in the repository but are **not approved and must remain unapplied**. Do not run a blanket `drizzle-kit migrate` against the demo database: it would attempt to apply both. Application registration explicitly supplies `VENDOR` for 0016 compatibility.

`DATABASE_MIGRATION_URL` is used only by `drizzle.config.ts`; startup, tests, and production builds do not run migrations automatically.

## Installation and local setup

Prerequisites:

- Node.js 20 LTS or later
- npm
- A PostgreSQL-compatible database already at the approved 0016 baseline
- ImageKit credentials only when attachments are used

```bash
git clone <repository-url>
cd VendorBridge-X-Kagnus
npm install
```

Create `.env.local` with the applicable values below. Do **not** add automatic migrations to startup. After confirming the database is already at migration 0016:

```bash
npm run dev
```

Open `http://localhost:3000`; the root route redirects to `/login`.

## Environment variables

Never commit real values. All database, ImageKit, invoice, and SMTP variables are server-only and must not use `NEXT_PUBLIC_`.

### Runtime database and attachments (`.env.local`)

```dotenv
# Required by the runtime application.
DATABASE_URL="postgresql://USERNAME:PASSWORD@HOST:PORT/DATABASE?sslmode=require"

# Required only by explicit development migration commands. Do not run a
# blanket migration command against the current 0016 demo database.
DATABASE_MIGRATION_URL="<approved privileged migration URL>"

# Required only for attachment upload/download.
IMAGEKIT_PUBLIC_KEY="public_key_placeholder"
IMAGEKIT_PRIVATE_KEY="private_key_placeholder"
IMAGEKIT_URL_ENDPOINT="https://ik.imagekit.io/your_imagekit_id"
```

The code uses `DATABASE_URL` for runtime and `DATABASE_MIGRATION_URL` for Drizzle configuration. Deployment credential separation must be completed and verified by the deployment operator; this README does not claim that deployed credentials are separated.

### Invoice/PDF configuration

Invoice generation requires a factual approved rate:

```dotenv
INVOICE_GST_RATE="<approved decimal percentage from 0 to 100>"
```

PDF generation requires real issuer details; do not invent legal information:

```dotenv
INVOICE_ISSUER_LEGAL_NAME="<legal name>"
INVOICE_ISSUER_ADDRESS_LINE1="<address>"
INVOICE_ISSUER_CITY="<city>"
INVOICE_ISSUER_STATE="<state>"
INVOICE_ISSUER_POSTAL_CODE="<postal code>"
INVOICE_ISSUER_COUNTRY="<country>"
INVOICE_ISSUER_GSTIN="<GSTIN>"
```

Optional fields: `INVOICE_ISSUER_ADDRESS_LINE2`, `INVOICE_ISSUER_EMAIL`, and `INVOICE_ISSUER_PHONE`.

### Invoice email configuration

```dotenv
SMTP_HOST="<SMTP host>"
SMTP_PORT="<TCP port>"
SMTP_SECURE="true-or-false"
SMTP_USER="<SMTP user>"
SMTP_APP_PASSWORD="<SMTP credential>"
INVOICE_EMAIL_FROM="<approved sender address>"
```

SMTP delivery has **not** been independently verified. A successful action represents SMTP handoff, not inbox delivery.

### Isolated integration environment (`.env.test.local`)

```dotenv
TEST_DATABASE_URL="postgresql://USERNAME:PASSWORD@HOST:PORT/TEST_DATABASE?sslmode=require"
TEST_NEON_BRANCH_ID="your-isolated-neon-branch-id"
```

These values are for the isolated integration branch and test Procurement Officer provisioning CLI. The integration setup verifies the live Neon branch before access. Do not point them at development or production, and preserve them unless explicitly authorized.

## Commands and verification

| Task | Command |
| --- | --- |
| Development server | `npm run dev` |
| Production build | `npm run build` |
| Production server | `npm run start` |
| Unit tests | `npm test` |
| Unit watch mode | `npm run test:watch` |
| Type check | `npx tsc --noEmit` |
| Lint | `npm run lint` |
| Isolated integration tests | `npm run test:integration` |
| Provision test Procurement Officer | `npm run provision:test-procurement-officer -- --email <email> --username <username>` |

If PowerShell blocks `npm.ps1`, use `npm.cmd` or `npx.cmd`.

Latest local verification:

- **75 unit test files / 346 tests passed**
- TypeScript passed
- ESLint passed
- `git diff --check` passed
- `npm run build` passed with Next.js 16.4.2

Integration tests were not run during final verification because they connect to the configured isolated Neon branch. Live end-to-end database testing is not claimed.

## Known limitations and external requirements

- RFQ close, cancel, and edit workflows are not exposed; creation and publish-to-open are implemented.
- Vendor update/delete and general role management are not implemented.
- The admin role-promotion endpoint returns `410 Gone`.
- Vendors cannot self-link to an existing vendor profile through an endpoint; self-onboarding creates a pending profile and membership.
- Submitted quotations are immutable; vendor ratings are unavailable.
- Reports cover generated documents, not actual payments or payment analytics.
- ImageKit is required for attachment operations.
- Invoice PDFs require actual issuer/GST configuration; invoice email requires valid SMTP configuration.
- The approved migration-0016 email model stores only `SENT` and `FAILED` outcomes. If SMTP is attempted but its outcome cannot be recorded, VendorBridge retains the 10-minute claim and returns an uncertain-outcome error; operators must review SMTP/provider evidence before retrying after that lease expires. This baseline cannot durably represent uncertainty or guarantee exactly-once delivery.
- SMTP/inbox delivery, deployed PDF printing, and live end-to-end database workflow verification have not been independently demonstrated.
- No deployment URL, screenshots, or recorded demonstration are included.

## Submission companion

[`SUBMISSION.md`](./SUBMISSION.md) contains a report-ready project overview, feature summary, architecture explanation, implementation decisions, known limitations, a suggested demonstration script, and a screenshot checklist. It deliberately does not claim a deployment URL, screenshots, demo accounts, or unperformed verification.
