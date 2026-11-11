import { NextResponse } from "next/server";
export async function PATCH() {
  return NextResponse.json(
    {
      message:
        "Role management is temporarily handled through an administrator-operated process.",
    },
    { status: 410 },
  );
}
