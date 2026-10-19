import { NextRequest, NextResponse } from "next/server";
import { requireUserId } from "@/lib/auth";
import {
  createServerSupabaseClient,
  isSupabaseConfigured,
} from "@/lib/supabase/server";
import type { Action, CareData } from "@/lib/types";
import type { CarePlanStatus } from "@/lib/supabase/types";
import { buildCalendarDeletePrompt, classifyDeleteResponse } from "@/lib/fo-execute";
import { runFoPrompt } from "@/lib/run-fo";

export const maxDuration = 120;

function isAuthConfigError(message: string) {
  return /key or wrong key type|JWT|JWSInvalid|invalid claim/i.test(message);
}

function chooseActions(primary: Action[] | null | undefined, fallback: Action[] | null | undefined) {
  const first = primary ?? [];
  const second = fallback ?? [];
  const firstDone = first.some((action) => action.result || action.status === "done");
  const secondDone = second.some((action) => action.result || action.status === "done");
  if (secondDone && !firstDone) return second;
  return first.length ? first : second;
}

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

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error } = await requireUserId();
  if (error) return error;

  const { id } = await params;
  let body: {
    status?: string;
    data?: CareData;
    approved_actions?: Action[] | null;
  } = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  let actions = chooseActions(body.approved_actions, body.data?.actions);
  let status = body.status ?? "extracted";

  if (isSupabaseConfigured()) {
    const supabase = createServerSupabaseClient();
    const { data: row, error: dbError } = await supabase
      .from("care_plans")
      .select("status, data, approved_actions")
      .eq("id", id)
      .maybeSingle();

    if (dbError && !isAuthConfigError(dbError.message)) {
      return NextResponse.json({ error: dbError.message }, { status: 500 });
    }
    if (row) {
      actions = chooseActions(row.approved_actions as Action[] | null, actions);
      if (!actions.length) actions = chooseActions((row.data as CareData | null)?.actions, actions);
      status = row.status || status;
    }
  }

  const created =
    status === "done" ||
    status === "executing" ||
    actions.some((action) => action.status === "done" || action.status === "processing");
  const prompt = created ? buildCalendarDeletePrompt(actions) : null;
  const calendarWarning =
    "The care plan was deleted. Fo could not remove its calendar events, so check Google Calendar for anything still there.";

  let response = "";
  let warning = "";
  if (prompt) {
    try {
      response = await runFoPrompt(prompt);
      if (classifyDeleteResponse(response) !== "complete") warning = calendarWarning;
    } catch {
      warning = calendarWarning;
    }
  }

  if (isSupabaseConfigured()) {
    const supabase = createServerSupabaseClient();
    const { error: dbError } = await supabase.from("care_plans").delete().eq("id", id);
    if (dbError && !isAuthConfigError(dbError.message)) {
      return NextResponse.json({ error: dbError.message }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true, response, warning });
}
