import { NextResponse } from "next/server";
import { z } from "zod";
import {
  ApprovalNotFoundError,
  decideApproval,
  InvalidApprovalTransitionError,
} from "@/lib/approvals";
import { requireRole } from "@/lib/authorization";
import { approvalDecisionSchema } from "@/lib/validations/approval";

type RouteContext = { params: Promise<{ approvalId: string }> };

export async function POST(request: Request, { params }: RouteContext) {
  const authorization = await requireRole(["MANAGER"]);
  if (!authorization.authorized) {
    return NextResponse.json(
      { message: authorization.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: authorization.status },
    );
  }

  const { approvalId } = await params;
  if (!z.string().uuid().safeParse(approvalId).success) {
    return NextResponse.json({ message: "Approval not found." }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "Invalid JSON request body" }, { status: 400 });
  }

  const result = approvalDecisionSchema.safeParse(body);
  if (!result.success) {
    return NextResponse.json(
      {
        message: "Select a decision and enter decision remarks.",
        fieldErrors: result.error.flatten().fieldErrors,
      },
      { status: 400 },
    );
  }

  try {
    const approval = await decideApproval(
      approvalId,
      authorization.user.id,
      result.data,
    );
    return NextResponse.json({
      message: result.data.action === "APPROVE" ? "Quotation approved." : "Quotation rejected.",
      approval,
    });
  } catch (error) {
    if (error instanceof ApprovalNotFoundError) {
      return NextResponse.json({ message: "Approval not found." }, { status: 404 });
    }
    if (error instanceof InvalidApprovalTransitionError) {
      return NextResponse.json(
        { message: "Only pending approvals can be decided." },
        { status: 409 },
      );
    }

    console.error("Decide approval error:", error);
    return NextResponse.json(
      { message: "Unable to record the approval decision." },
      { status: 500 },
    );
  }
}
