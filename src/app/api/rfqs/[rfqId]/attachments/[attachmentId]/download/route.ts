import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { rfqAttachments, rfqVendorAssignments } from "@/db/schema";
import {
  getImageKitClient,
  getImageKitUrlEndpoint,
  isImageKitDeliveryUrl,
} from "@/lib/imagekit";
import { getRfqViewer } from "@/lib/rfq-access";
import { attachmentContentDisposition } from "@/lib/rfq-attachments";

type RouteContext = {
  params: Promise<{ rfqId: string; attachmentId: string }>;
};

export async function GET(request: Request, { params }: RouteContext) {
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
    mimeType: rfqAttachments.mimeType,
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
    const urlEndpoint = getImageKitUrlEndpoint();
    const url = getImageKitClient().helper.buildSrc({
      urlEndpoint,
      src: attachment.storagePath,
      transformation: [{ raw: "orig-true" }],
      signed: true,
      expiresIn: 60,
    });

    if (!isImageKitDeliveryUrl(url, urlEndpoint)) {
      console.error("RFQ attachment download generated an untrusted upstream URL.");
      return NextResponse.json(
        { message: "Unable to prepare the attachment download." },
        { status: 502 },
      );
    }

    const upstream = await fetch(url, {
      cache: "no-store",
      redirect: "error",
      signal: request.signal,
    });

    if (!upstream.ok || !upstream.body) {
      console.error("RFQ attachment download upstream response failed:", {
        status: upstream.status,
      });
      return NextResponse.json(
        { message: "Unable to download the attachment." },
        { status: 502 },
      );
    }

    return new NextResponse(upstream.body, {
      headers: {
        "Cache-Control": "private, no-store",
        "Content-Disposition": attachmentContentDisposition(
          attachment.originalFilename,
        ),
        "Content-Type": attachment.mimeType,
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    if (request.signal.aborted) {
      return new NextResponse(null, { status: 499 });
    }

    console.error("RFQ attachment download upstream request failed:", {
      name: error instanceof Error ? error.name : "UnknownError",
    });
    return NextResponse.json(
      { message: "Unable to download the attachment." },
      { status: 502 },
    );
  }
}
