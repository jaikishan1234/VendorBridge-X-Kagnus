import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { rfqs } from "@/db/schema";
import { requireRole } from "@/lib/authorization";
import { attachmentFolder, storageFilename, validateAttachmentMetadata } from "@/lib/rfq-attachments";
import { getImageKitClient, getImageKitPublicKey } from "@/lib/imagekit";

const uploadRequestSchema = z.object({
  filename: z.string(),
  mimeType: z.string(),
  size: z.number(),
});

type RouteContext = { params: Promise<{ rfqId: string }> };

export async function POST(request: Request, { params }: RouteContext) {
  const authorization = await requireRole(["PROCUREMENT_OFFICER"]);

  if (!authorization.authorized) {
    return NextResponse.json(
      { message: authorization.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: authorization.status },
    );
  }

  const { rfqId } = await params;

  if (!z.string().uuid().safeParse(rfqId).success) {
    return NextResponse.json({ message: "RFQ not found." }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "Invalid JSON request body" }, { status: 400 });
  }

  const parsed = uploadRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ message: "Invalid attachment metadata." }, { status: 400 });
  }

  const validationMessage = validateAttachmentMetadata(parsed.data);
  if (validationMessage) {
    return NextResponse.json({ message: validationMessage }, { status: 400 });
  }

  const [rfq] = await db
    .select({ id: rfqs.id })
    .from(rfqs)
    .where(eq(rfqs.id, rfqId))
    .limit(1);

  if (!rfq) {
    return NextResponse.json({ message: "RFQ not found." }, { status: 404 });
  }

  try {
    const auth = getImageKitClient().helper.getAuthenticationParameters();
    const filename = storageFilename(parsed.data.filename, randomUUID());

    return NextResponse.json({
      ...auth,
      publicKey: getImageKitPublicKey(),
      folder: attachmentFolder(rfq.id),
      fileName: filename,
      checks: "file.size < 10MB",
    });
  } catch (error) {
    console.error("ImageKit upload authorization error:", error);
    return NextResponse.json({ message: "Attachment uploads are not configured." }, { status: 503 });
  }
}
