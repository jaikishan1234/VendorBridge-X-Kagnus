import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { rfqAttachments, rfqs } from "@/db/schema";
import { requireRole } from "@/lib/authorization";
import {
  attachmentFolder,
  isAllowedAttachment,
  MAX_RFQ_ATTACHMENT_SIZE,
  originalFilenameFromStorageName,
} from "@/lib/rfq-attachments";
import { getImageKitClient } from "@/lib/imagekit";

const attachmentSchema = z.object({
  fileId: z.string().trim().min(1).max(255),
});

type RouteContext = { params: Promise<{ rfqId: string }> };

async function requireManagedRfq(rfqId: string) {
  if (!z.string().uuid().safeParse(rfqId).success) return undefined;

  const [rfq] = await db
    .select({ id: rfqs.id })
    .from(rfqs)
    .where(eq(rfqs.id, rfqId))
    .limit(1);

  return rfq;
}

export async function POST(request: Request, { params }: RouteContext) {
  const authorization = await requireRole(["PROCUREMENT_OFFICER"]);

  if (!authorization.authorized) {
    return NextResponse.json(
      { message: authorization.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: authorization.status },
    );
  }

  const { rfqId } = await params;
  const rfq = await requireManagedRfq(rfqId);
  if (!rfq) return NextResponse.json({ message: "RFQ not found." }, { status: 404 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "Invalid JSON request body" }, { status: 400 });
  }

  const parsed = attachmentSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ message: "Invalid attachment reference." }, { status: 400 });
  }

  try {
    const file = await getImageKitClient().files.get(parsed.data.fileId);
    const storagePath = file.filePath;
    const storageName = file.name;
    const fileSize = file.size;
    const originalFilename = storageName
      ? originalFilenameFromStorageName(storageName)
      : undefined;

    if (
      !file.fileId ||
      !storagePath ||
      !storageName ||
      !originalFilename ||
      !file.mime ||
      !Number.isSafeInteger(fileSize) ||
      !fileSize ||
      fileSize > MAX_RFQ_ATTACHMENT_SIZE ||
      !file.isPrivateFile ||
      !storagePath.startsWith(`${attachmentFolder(rfq.id)}/`) ||
      !isAllowedAttachment(originalFilename, file.mime)
    ) {
      return NextResponse.json({ message: "The uploaded file did not meet attachment requirements." }, { status: 400 });
    }

    const [attachment] = await db
      .insert(rfqAttachments)
      .values({
        rfqId: rfq.id,
        uploaderUserId: authorization.user.id,
        imagekitFileId: file.fileId,
        originalFilename,
        mimeType: file.mime,
        size: fileSize,
        storagePath,
      })
      .returning({
        id: rfqAttachments.id,
        originalFilename: rfqAttachments.originalFilename,
        mimeType: rfqAttachments.mimeType,
        size: rfqAttachments.size,
      });

    return NextResponse.json({ attachment }, { status: 201 });
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "23505") {
      return NextResponse.json({ message: "This file is already attached to an RFQ." }, { status: 409 });
    }

    console.error("Create RFQ attachment error:", error);
    return NextResponse.json({ message: "Unable to save this attachment." }, { status: 502 });
  }
}

export async function DELETE(request: Request, { params }: RouteContext) {
  const authorization = await requireRole(["PROCUREMENT_OFFICER"]);

  if (!authorization.authorized) {
    return NextResponse.json(
      { message: authorization.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: authorization.status },
    );
  }

  const { rfqId } = await params;
  const rfq = await requireManagedRfq(rfqId);
  if (!rfq) return NextResponse.json({ message: "RFQ not found." }, { status: 404 });

  const attachmentId = new URL(request.url).searchParams.get("attachmentId");
  if (!attachmentId || !z.string().uuid().safeParse(attachmentId).success) {
    return NextResponse.json({ message: "Invalid attachment reference." }, { status: 400 });
  }

  const [attachment] = await db
    .select({ id: rfqAttachments.id, imagekitFileId: rfqAttachments.imagekitFileId })
    .from(rfqAttachments)
    .where(and(eq(rfqAttachments.id, attachmentId), eq(rfqAttachments.rfqId, rfq.id)))
    .limit(1);

  if (!attachment) return NextResponse.json({ message: "Attachment not found." }, { status: 404 });

  try {
    await getImageKitClient().files.delete(attachment.imagekitFileId);
    await db.delete(rfqAttachments).where(eq(rfqAttachments.id, attachment.id));
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    console.error("Delete RFQ attachment error:", error);
    return NextResponse.json({ message: "Unable to delete this attachment." }, { status: 502 });
  }
}
