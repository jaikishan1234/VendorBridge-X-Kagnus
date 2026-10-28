import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { rfqAttachments, rfqVendorAssignments } from "@/db/schema";
import { getImageKitClient, getImageKitUrlEndpoint } from "@/lib/imagekit";
import { getRfqViewer } from "@/lib/rfq-access";

type RouteContext = {
  params: Promise<{ rfqId: string; attachmentId: string }>;
};

export async function GET(_request: Request, { params }: RouteContext) {
  const viewer = await getRfqViewer();

  if (viewer.kind === "unauthenticated") {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  if (viewer.kind === "forbidden") {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  const { rfqId, attachmentId } = await params;
  if (
    !z.string().uuid().safeParse(rfqId).success ||
    !z.string().uuid().safeParse(attachmentId).success ||
    viewer.kind === "unlinked-vendor"
  ) {
    return NextResponse.json({ message: "Attachment not found." }, { status: 404 });
  }

  const attachmentSelection = {
    storagePath: rfqAttachments.storagePath,
    originalFilename: rfqAttachments.originalFilename,
  };
  const [attachment] =
    viewer.kind === "procurement"
      ? await db
          .select(attachmentSelection)
          .from(rfqAttachments)
          .where(
            and(
              eq(rfqAttachments.id, attachmentId),
              eq(rfqAttachments.rfqId, rfqId),
            ),
          )
          .limit(1)
      : await db
          .select(attachmentSelection)
          .from(rfqAttachments)
          .innerJoin(
            rfqVendorAssignments,
            eq(rfqVendorAssignments.rfqId, rfqAttachments.rfqId),
          )
          .where(
            and(
              eq(rfqAttachments.id, attachmentId),
              eq(rfqAttachments.rfqId, rfqId),
              eq(rfqVendorAssignments.vendorId, viewer.vendorId),
            ),
          )
          .limit(1);

  if (!attachment) {
    return NextResponse.json({ message: "Attachment not found." }, { status: 404 });
  }

  try {
    const url = getImageKitClient().helper.buildSrc({
      urlEndpoint: getImageKitUrlEndpoint(),
      src: attachment.storagePath,
      transformation: [{ raw: "orig-true" }],
      signed: true,
      expiresIn: 60,
    });

    return NextResponse.redirect(url);
  } catch (error) {
    console.error("RFQ attachment download error:", error);
    return NextResponse.json({ message: "Unable to prepare the attachment download." }, { status: 503 });
  }
}
