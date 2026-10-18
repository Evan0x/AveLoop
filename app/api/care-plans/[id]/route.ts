import { NextRequest, NextResponse } from "next/server";
import { requireUserId } from "@/lib/auth";
import {
  createServerSupabaseClient,
  isSupabaseConfigured,
} from "@/lib/supabase/server";
import type { Action, CareData } from "@/lib/types";
import type { CarePlanStatus } from "@/lib/supabase/types";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error } = await requireUserId();
  if (error) return error;

  if (!isSupabaseConfigured()) {
    return NextResponse.json(
      { error: "Supabase is not configured." },
      { status: 503 }
    );
  }

  const { id } = await params;
  const supabase = createServerSupabaseClient();
  const { data, error: dbError } = await supabase
    .from("care_plans")
    .select("*")
    .eq("id", id)
    .single();

  if (dbError) {
    return NextResponse.json({ error: dbError.message }, { status: 404 });
  }

  return NextResponse.json({ plan: data });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error } = await requireUserId();
  if (error) return error;

  if (!isSupabaseConfigured()) {
    return NextResponse.json({ skipped: true });
  }

  const { id } = await params;
  const body = (await req.json()) as {
    data?: CareData;
    approved_actions?: Action[];
    status?: CarePlanStatus;
  };

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.data) updates.data = body.data;
  if (body.approved_actions) updates.approved_actions = body.approved_actions;
  if (body.status) updates.status = body.status;

  const supabase = createServerSupabaseClient();
  const { error: dbError } = await supabase
    .from("care_plans")
    .update(updates)
    .eq("id", id);

  if (dbError) {
    return NextResponse.json({ error: dbError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
