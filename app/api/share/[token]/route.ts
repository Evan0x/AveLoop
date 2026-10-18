import { NextRequest, NextResponse } from "next/server";
import { getShare } from "@/lib/share-store";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const share = await getShare(token);
  if (!share) {
    return NextResponse.json({ error: "Share link not found." }, { status: 404 });
  }
  return NextResponse.json({ share });
}
