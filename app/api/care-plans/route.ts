import { NextRequest, NextResponse } from "next/server";
import { requireUserId } from "@/lib/auth";
import {
  createServerSupabaseClient,
  isSupabaseConfigured,
} from "@/lib/supabase/server";
import type { CareData } from "@/lib/types";

function isAuthConfigError(message: string) {
  return /key or wrong key type|JWT|JWSInvalid|invalid claim/i.test(message);
}

export async function GET() {
  const { error } = await requireUserId();
  if (error) return error;

  if (!isSupabaseConfigured()) {
    return NextResponse.json({ plans: [], skipped: true });
  }

  const supabase = createServerSupabaseClient();
  const { data, error: dbError } = await supabase
    .from("care_plans")
    .select("id, status, created_at, updated_at, data, notes")
    .order("created_at", { ascending: false });

  if (dbError) {
    if (isAuthConfigError(dbError.message)) {
      return NextResponse.json({ plans: [], skipped: true });
    }
    return NextResponse.json({ error: dbError.message }, { status: 500 });
  }

  return NextResponse.json({ plans: data ?? [] });
}

export async function POST(req: NextRequest) {
  const { userId, error } = await requireUserId();
  if (error) return error;

  if (!isSupabaseConfigured()) {
    return NextResponse.json({ id: null, skipped: true });
  }

  const body = await req.json();
  const { notes, data } = body as { notes?: string; data?: CareData };

  if (!data) {
    return NextResponse.json({ error: "Missing care data." }, { status: 400 });
  }

  const supabase = createServerSupabaseClient();
  const { data: row, error: dbError } = await supabase
    .from("care_plans")
    .insert({
      user_id: userId,
      notes: notes ?? null,
      data,
      status: "extracted",
    })
    .select("id")
    .single();

  if (dbError) {
    if (isAuthConfigError(dbError.message)) {
      return NextResponse.json({ id: null, skipped: true });
    }
    return NextResponse.json({ error: dbError.message }, { status: 500 });
  }

  return NextResponse.json({ id: row.id });
}
