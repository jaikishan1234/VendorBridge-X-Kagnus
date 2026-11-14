# VendorBridge — Week 4 Submission Companion

## Project overview

VendorBridge is a role-scoped procurement and vendor-management ERP prototype. It gives procurement teams a traceable workflow from vendor onboarding and RFQ creation through quotation comparison, managerial approval, purchase-order generation, invoicing, document delivery, reporting, and audit visibility. The application is designed so that vendors see only their own assigned records, while Procurement Officers and Managers receive only the views and actions needed for their roles.

The project focuses on a realistic procurement lifecycle with persisted PostgreSQL records rather than sample dashboard data. New workflow transitions create append-only activity events and recipient-specific in-app notifications, helping users understand what changed and what action is needed next. The production `activity_events` table currently has zero historical records because activity logging was added after the existing workflow records; no synthetic history has been created.

## Production deployment

VendorBridge is successfully deployed on Vercel at [https://vendor-bridge-x-kagnus.vercel.app](https://vendor-bridge-x-kagnus.vercel.app). This confirms the published application URL; it does not claim that every live workflow or role-based production scenario has been independently verified.

## Verification status

- **Implemented:** the features described below are present in the application and source code, including role-scoped workflows, activity logging, notifications, PDF generation, reporting, and CSV export.
- **Independently verified:** the Vercel production deployment succeeded; PDF generation has been manually verified; and automated verification passed (75 test files / 346 tests, TypeScript, ESLint, and production build).
- **Not independently verified:** SMTP/inbox delivery and every live end-to-end workflow or role-based production scenario.

## Feature-by-feature implementation summary

| Area | Implementation |
| --- | --- |
| Authentication and access | Custom database-backed session authentication is used, not Better Auth. Passwords are stored with Argon2 hashes. Session cookies are HTTP-only and only hashed session tokens are persisted. Server-side role checks protect pages and API routes. |
| Vendor onboarding | Procurement Officers can create vendors; a newly registered vendor can create one self-profile while unlinked. Vendor identity is derived from membership records, never a client-supplied vendor ID. |
| RFQs | Procurement Officers create draft RFQs with vendors, line items, a currency, a future deadline, and optional controlled attachments. Valid drafts can be published to assigned vendors. |
| Quotations | Assigned linked vendors can save and submit one complete quotation per RFQ before its deadline. Submitted quotations are immutable. |
| Comparison and approval | Procurement Officers compare persisted submissions and request approval for one submitted quotation. Managers approve or reject with required remarks and retained decision history. |
| Purchase orders | A single approved selection can generate one persisted PO with immutable line-item and total snapshots. |
| Invoices and documents | A PO can generate one invoice with persisted tax and amount snapshots. Authorized users can download a server-rendered PDF and use the browser print flow. PDF generation has been manually verified. Procurement Officers can submit the invoice PDF to the vendor's persisted email address through configured SMTP; SMTP/inbox delivery has not been independently verified. |
| Activity and notifications | Important new workflow events are append-only audit records with actor and timestamp. In-app notifications are generated transactionally for authorized recipients and support unread/read state. The production activity table has no historical rows because it was introduced after the existing workflow records. |
| Reporting | Procurement-only reports use persisted RFQ, quotation, PO, and invoice records. PO values remain separated by currency, and authorized users can export POs as escaped CSV. |
| Dashboard and navigation | Dashboards use role-scoped persisted data. Navigation presents only appropriate modules for Procurement Officers, Vendors, Managers, and Administrators. |

## Architecture and technology stack

The application uses Next.js 16 App Router and React 19 with TypeScript. Pages render on the server for authorization-aware data access, while focused client components handle forms, notification refreshes, and interactive panels. Tailwind CSS supplies the interface styling.

The data layer uses Drizzle ORM with PostgreSQL-compatible Neon connectivity. Business operations that must remain consistent—such as approval decisions, document creation, activity records, and notifications—execute in database transactions. Zod validates untrusted request input, and shared access helpers resolve the authenticated session, role, vendor membership, and record visibility.

```text
Browser UI
    │
    ├── Next.js pages and client panels
    │       │
    │       └── Role-authorized route handlers
    │               │
    │               ├── Validation (Zod)
    │               ├── Workflow services / transactions
    │               ├── Activity + in-app notifications
    │               ├── PDFKit / Nodemailer / ImageKit integrations
    │               └── Drizzle ORM
    │                       │
    └───────────────────────┴── PostgreSQL / Neon
```

## Important implementation decisions

- Role authorization is enforced on the server, not only by hidden navigation or client-side controls.
- Vendor isolation derives the vendor profile from the signed-in user's membership. API consumers cannot choose another vendor ID to access its RFQs, quotations, POs, invoices, activities, or notifications.
- Purchase-order and invoice line items are stored as snapshots. Later changes to RFQs or quotations cannot silently alter a generated document.
- Reports keep monetary totals separated by currency; the application does not add unrelated currencies together.
- Activity events are append-only and notification recipients are deduplicated transactionally. A database uniqueness constraint protects against duplicate event-recipient notifications.
- Invoice PDF and email actions read persisted document data only. Invoice issuer, GST, and SMTP information must come from real deployment configuration; the project intentionally does not fabricate business details.
- Runtime database access uses `DATABASE_URL`; the migration configuration uses a separate `DATABASE_MIGRATION_URL`. Existing demo data remains at approved migration 0016. Migrations 0017 and 0018 must remain unapplied.

## Application screenshots

Five actual application screenshots were captured for the Week 4 submission. Their repository-relative locations are listed below.

| Screenshot | Location | Caption |
| --- | --- | --- |
| Dashboard | [`docs/screenshots/01-dashboard.png`](docs/screenshots/01-dashboard.png) | Procurement Officer dashboard and role-scoped navigation. |
| RFQ | [`docs/screenshots/02-rfq.png`](docs/screenshots/02-rfq.png) | RFQ workflow view. |
| Quotations | [`docs/screenshots/03-quotations.png`](docs/screenshots/03-quotations.png) | Procurement quotation comparison view. |
| Purchase orders and invoices | [`docs/screenshots/04-purchase-orders-invoices.png`](docs/screenshots/04-purchase-orders-invoices.png) | Purchase-order and invoice workflow views. |
| Reports | [`docs/screenshots/05-reports.png`](docs/screenshots/05-reports.png) | Procurement reports and analytics view. |

## Known limitations and future improvements

- RFQ editing, closing, and cancellation workflows are not exposed.
- Vendor update/delete and general role-management screens are not implemented. The legacy admin role-promotion endpoint intentionally returns `410 Gone`.
- Vendor self-linking to an existing vendor profile is not available; self-onboarding creates a pending profile and membership.
- Reports cover generated documents, not payment status, vendor ratings, delivery performance, quality scores, or savings.
- Attachment workflows require configured ImageKit credentials. PDF generation requires factual issuer and GST configuration, and email delivery requires valid SMTP configuration.
- Password reset storage and validation exist, but reset-email delivery is not implemented.
- SMTP handoff/inbox delivery, browser-based PDF printing in a deployment, and all live end-to-end database workflow and role-based checks have not been independently verified.
- No demo recording is included. Five application screenshots are included in `docs/screenshots/`.

## Suggested demo-video walkthrough

1. Introduce VendorBridge and explain its four roles: Vendor, Procurement Officer, Manager, and Admin.
2. Sign in as a Procurement Officer and show the role-specific dashboard and navigation.
3. Create or open a vendor, then create an RFQ with line items, a currency, deadline, and assigned vendors. Publish the RFQ.
4. Sign in as the assigned Vendor. Show the open RFQ, create a quotation, save it, and submit it before the deadline.
5. Return as the Procurement Officer. Open the quotation comparison and select the submitted quotation for approval.
6. Sign in as a Manager. Review the pending approval, record decision remarks, and approve it.
7. Return as the Procurement Officer. Generate the purchase order, then generate the invoice from that PO.
8. Download the invoice PDF; explain that browser printing is available from the downloaded document. If real SMTP is configured, demonstrate the email action and describe it as SMTP handoff rather than final inbox delivery.
9. Show the activity timeline and notification list for at least two roles to demonstrate actor, timestamp, and recipient-scoped visibility.
10. Show the Procurement Officer reports and download the purchase-order CSV. Conclude with role isolation and the known limitations.

Only record actions against safe demonstration data. Do not display environment variables, credentials, real customer data, or unverified email/GST details.

## Screenshot checklist

- [x] Procurement Officer dashboard and navigation — `docs/screenshots/01-dashboard.png`
- [x] RFQ workflow — `docs/screenshots/02-rfq.png`
- [x] Procurement quotation comparison — `docs/screenshots/03-quotations.png`
- [x] Purchase orders and invoices — `docs/screenshots/04-purchase-orders-invoices.png`
- [x] Procurement reports and analytics — `docs/screenshots/05-reports.png`

The captured set documents the listed views only; it does not independently verify every role-specific or live workflow scenario.

## Final submission checklist

- [ ] Set only real, approved runtime environment values in the deployment platform; never commit `.env.local` or `.env.test.local`.
- [ ] Confirm the target database is already on the approved 0016 baseline. Do not run a blanket migration command.
- [ ] Configure `DATABASE_URL`; configure ImageKit only when attachments are required.
- [ ] Provide approved invoice issuer/GST values before demonstrating PDF generation, and approved SMTP values before demonstrating email.
- [x] Automated verification completed: 75 test files / 346 tests passed; TypeScript, ESLint, and the production build passed.
- [x] Confirm the successful Vercel deployment at [https://vendor-bridge-x-kagnus.vercel.app](https://vendor-bridge-x-kagnus.vercel.app).
- [x] Capture the five Week 4 application screenshots without exposing secrets or sensitive business information.
- [ ] Independently verify additional live role-based workflow scenarios only with safe demonstration data, if required by the assessment.
