import PDFDocument from "pdfkit";
import type { InvoiceDocument } from "@/lib/invoices";

const requiredIssuerEnvironmentVariables = [
  "INVOICE_ISSUER_LEGAL_NAME",
  "INVOICE_ISSUER_ADDRESS_LINE1",
  "INVOICE_ISSUER_CITY",
  "INVOICE_ISSUER_STATE",
  "INVOICE_ISSUER_POSTAL_CODE",
  "INVOICE_ISSUER_COUNTRY",
  "INVOICE_ISSUER_GSTIN",
] as const;

export class InvoiceIssuerConfigurationError extends Error {}

export type InvoiceIssuerConfiguration = {
  legalName: string;
  addressLine1: string;
  addressLine2?: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  gstin: string;
  email?: string;
  phone?: string;
};

export function getInvoiceIssuerConfiguration(): InvoiceIssuerConfiguration {
  const missing = requiredIssuerEnvironmentVariables.filter(
    (name) => !process.env[name]?.trim(),
  );
  if (missing.length > 0) {
    throw new InvoiceIssuerConfigurationError(
      `Missing required invoice issuer configuration: ${missing.join(", ")}.`,
    );
  }

  return {
    legalName: process.env.INVOICE_ISSUER_LEGAL_NAME!.trim(),
    addressLine1: process.env.INVOICE_ISSUER_ADDRESS_LINE1!.trim(),
    addressLine2: process.env.INVOICE_ISSUER_ADDRESS_LINE2?.trim() || undefined,
    city: process.env.INVOICE_ISSUER_CITY!.trim(),
    state: process.env.INVOICE_ISSUER_STATE!.trim(),
    postalCode: process.env.INVOICE_ISSUER_POSTAL_CODE!.trim(),
    country: process.env.INVOICE_ISSUER_COUNTRY!.trim(),
    gstin: process.env.INVOICE_ISSUER_GSTIN!.trim(),
    email: process.env.INVOICE_ISSUER_EMAIL?.trim() || undefined,
    phone: process.env.INVOICE_ISSUER_PHONE?.trim() || undefined,
  };
}

function groupDigits(value: string): string {
  return value.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/** Formats a persisted decimal string without converting it to JavaScript Number. */
function formatMoney(currency: string, value: string): string {
  const match = /^(\d+)(?:\.(\d+))?$/.exec(value);
  if (!match) return `${currency} ${value}`;
  return `${currency} ${groupDigits(match[1])}.${(match[2] ?? "").padEnd(2, "0")}`;
}

function formatRate(value: string): string {
  const [whole, decimal] = value.split(".");
  const fractional = decimal?.replace(/0+$/, "");
  return fractional ? `${whole}.${fractional}%` : `${whole}%`;
}

function contactLines(document: InvoiceDocument): string[] {
  const lines = [document.vendor.name];
  if (document.vendor.contactName) lines.push(`Contact: ${document.vendor.contactName}`);
  if (document.vendor.email) lines.push(document.vendor.email);
  if (document.vendor.phoneNumber) lines.push(document.vendor.phoneNumber);
  if (document.vendor.gstNumber) lines.push(`GSTIN: ${document.vendor.gstNumber}`);
  return lines;
}

function issuerLines(issuer: InvoiceIssuerConfiguration): string[] {
  return [
    issuer.legalName,
    issuer.addressLine1,
    ...(issuer.addressLine2 ? [issuer.addressLine2] : []),
    `${issuer.city}, ${issuer.state} ${issuer.postalCode}`,
    issuer.country,
    `GSTIN: ${issuer.gstin}`,
    ...(issuer.email ? [issuer.email] : []),
    ...(issuer.phone ? [issuer.phone] : []),
  ];
}

function appendTextLines(
  pdf: PDFKit.PDFDocument,
  lines: string[],
  x: number,
  y: number,
  width: number,
): number {
  let currentY = y;
  for (const line of lines) {
    pdf.text(line, x, currentY, { width, lineGap: 2 });
    currentY = pdf.y + 2;
  }
  return currentY;
}

function lineHeight(pdf: PDFKit.PDFDocument, description: string, width: number): number {
  return Math.max(20, pdf.heightOfString(description, { width, lineGap: 2 }) + 8);
}

/**
 * Renders a persisted invoice document only. It deliberately accepts no client
 * financial fields and does not calculate or alter any invoice amounts.
 */
export async function renderInvoicePdf(invoice: InvoiceDocument): Promise<Buffer> {
  const issuer = getInvoiceIssuerConfiguration();
  const pdf = new PDFDocument({ size: "A4", margin: 48, compress: false });
  const chunks: Buffer[] = [];
  const complete = new Promise<Buffer>((resolve, reject) => {
    pdf.on("data", (chunk: Buffer) => chunks.push(chunk));
    pdf.on("end", () => resolve(Buffer.concat(chunks)));
    pdf.on("error", reject);
  });

  const pageWidth = pdf.page.width - pdf.page.margins.left - pdf.page.margins.right;
  const left = pdf.page.margins.left;
  const bottom = pdf.page.height - pdf.page.margins.bottom;
  const right = left + pageWidth;

  pdf.font("Helvetica-Bold").fontSize(22).text("TAX INVOICE", left, 48, { width: pageWidth });
  pdf.font("Helvetica").fontSize(10);
  const issuerBottom = appendTextLines(pdf, issuerLines(issuer), left, 84, 235);
  const invoiceDetailsBottom = appendTextLines(
    pdf,
    [
      `Invoice: ${invoice.invoiceNumber}`,
      `Issue date: ${invoice.issuedAt.toISOString().slice(0, 10)}`,
      `Status: ${invoice.status}`,
      `Source PO: ${invoice.purchaseOrderNumber}`,
    ],
    right - 190,
    84,
    190,
  );

  let y = Math.max(issuerBottom, invoiceDetailsBottom, 176) + 22;
  pdf.font("Helvetica-Bold").fontSize(11).text("Bill to", left, y);
  y += 16;
  pdf.font("Helvetica").fontSize(10);
  const vendorBottom = appendTextLines(pdf, contactLines(invoice), left, y, 270);
  y = Math.max(vendorBottom, y + 68) + 24;

  const columns = {
    description: { x: left, width: 180 },
    quantity: { x: left + 184, width: 51 },
    unit: { x: left + 239, width: 50 },
    unitPrice: { x: left + 293, width: 79 },
    total: { x: left + 376, width: 88 },
  };
  const drawTableHeader = () => {
    pdf.font("Helvetica-Bold").fontSize(8);
    pdf.text("Description", columns.description.x, y, { width: columns.description.width });
    pdf.text("Qty", columns.quantity.x, y, { width: columns.quantity.width, align: "right" });
    pdf.text("Unit", columns.unit.x, y, { width: columns.unit.width });
    pdf.text("Unit price", columns.unitPrice.x, y, { width: columns.unitPrice.width, align: "right" });
    pdf.text("Line total", columns.total.x, y, { width: columns.total.width, align: "right" });
    y += 16;
    pdf.moveTo(left, y - 4).lineTo(right, y - 4).strokeColor("#888888").stroke();
  };
  const newPage = () => {
    pdf.addPage();
    y = pdf.page.margins.top;
    drawTableHeader();
  };

  drawTableHeader();
  pdf.font("Helvetica").fontSize(9);
  for (const item of invoice.lineItems) {
    const rowHeight = lineHeight(pdf, item.description, columns.description.width);
    if (y + rowHeight + 8 > bottom) newPage();
    pdf.font("Helvetica").fontSize(9);
    pdf.text(item.description, columns.description.x, y, {
      width: columns.description.width,
      lineGap: 2,
    });
    pdf.text(item.quantity, columns.quantity.x, y, { width: columns.quantity.width, align: "right" });
    pdf.text(item.unit, columns.unit.x, y, { width: columns.unit.width });
    pdf.text(formatMoney(invoice.currency, item.unitPrice), columns.unitPrice.x, y, {
      width: columns.unitPrice.width,
      align: "right",
    });
    pdf.text(formatMoney(invoice.currency, item.lineTotal), columns.total.x, y, {
      width: columns.total.width,
      align: "right",
    });
    y += rowHeight;
    pdf.moveTo(left, y - 3).lineTo(right, y - 3).strokeColor("#dddddd").stroke();
  }

  const totalsHeight = 82;
  if (y + totalsHeight > bottom) {
    pdf.addPage();
    y = pdf.page.margins.top;
  }
  const totalLabelX = left + 260;
  const totalValueX = left + 370;
  const drawTotal = (label: string, value: string, bold = false) => {
    pdf.font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(bold ? 11 : 10);
    pdf.text(label, totalLabelX, y, { width: 106, align: "right" });
    pdf.text(value, totalValueX, y, { width: 94, align: "right" });
    y += 19;
  };
  drawTotal("Subtotal", formatMoney(invoice.currency, invoice.subtotalAmount));
  drawTotal(`GST (${formatRate(invoice.gstRate)})`, formatMoney(invoice.currency, invoice.taxAmount));
  pdf.moveTo(totalLabelX, y - 4).lineTo(right, y - 4).strokeColor("#555555").stroke();
  drawTotal("Grand total", formatMoney(invoice.currency, invoice.grandTotal), true);

  pdf.end();
  return complete;
}
