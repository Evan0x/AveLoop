import { NextRequest, NextResponse } from "next/server";
import { requireUserId } from "@/lib/auth";
import { createShare } from "@/lib/share-store";
import type { Action, CareData } from "@/lib/types";

export async function POST(req: NextRequest) {
  const { error } = await requireUserId();
  if (error) return error;

  const body = await req.json();
  const { data, status, notes, approved_actions } = body as {
    data?: CareData;
    status?: string;
    notes?: string | null;
    approved_actions?: Action[] | null;
  };

  if (!data) {
    return NextResponse.json({ error: "Missing care plan." }, { status: 400 });
  }

  const share = await createShare({
    data,
    status: status ?? "extracted",
    notes: notes ?? null,
    approved_actions: approved_actions ?? data.actions,
  });

  return NextResponse.json({ token: share.token });
}
