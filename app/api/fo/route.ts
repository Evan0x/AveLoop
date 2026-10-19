import { NextRequest, NextResponse } from "next/server";
import type { Action } from "@/lib/types";
import { requireUserId } from "@/lib/auth";
import { askFo, getFoReply, pollUntilDone, type FoResult } from "@/lib/fo-client";
import { buildFoPrompt, classifyFoResponse, clinicFromReply, prepareActionForFo } from "@/lib/fo-execute";
import { runFoPrompt } from "@/lib/run-fo";

export const maxDuration = 120;

const conversations = new Map<string, string>();

async function runAgent(prompt: string, conversationId?: string): Promise<FoResult> {
  if (process.env.WAJO_TOKEN) {
    const asked = await askFo(prompt, conversationId ? { conversationId } : { newConversation: true });
    if (asked.status === "working") return pollUntilDone(asked.conversationId);
    return asked;
  }

  const response = await runFoPrompt(prompt);
  const convId = conversationId ?? crypto.randomUUID();
  return {
    response,
    status: classifyFoResponse(response),
    conversationId: convId,
  };
}

export async function POST(req: NextRequest) {
  try {
    const { error } = await requireUserId();
    if (error) return error;

    const body = await req.json();
    const { action, conversationId, replyMessage } = body as {
      action?: Action;
      conversationId?: string;
      replyMessage?: string;
    };

    let prompt: string;
    let convId = conversationId ?? crypto.randomUUID();

    if (replyMessage && (conversationId || action)) {
      const history = conversationId ? (conversations.get(conversationId) ?? "") : "";
      const chosen = clinicFromReply(replyMessage);
      const resumed = action
        ? buildFoPrompt(prepareActionForFo({ ...action, filledClinic: chosen ?? action.filledClinic }))
        : "";
      prompt = [
        resumed || history,
        `The patient replied: ${replyMessage}`,
        chosen ? `Chosen clinic: ${chosen}. Create the calendar event now.` : "",
        "Finish the task with this answer. Do not ask another question. Reply in 1-2 sentences with the event title, date, and location.",
      ]
        .filter(Boolean)
        .join("\n\n");
    } else if (action) {
      convId = crypto.randomUUID();
      prompt = buildFoPrompt(prepareActionForFo(action));
    } else {
      return NextResponse.json({ error: "Missing action or replyMessage" }, { status: 400 });
    }

    const result = await runAgent(prompt, convId);
    convId = result.conversationId || convId;
    const needsClinic = Boolean(action?.missing?.includes("clinic") && !action.filledClinic);
    const askedClinic = /which (clinic|location)/i.test(result.response);
    const askedToConnect = /authoriz|oauth|connector|reply ["']connected["']/i.test(result.response);
    if (action && !process.env.WAJO_TOKEN && ((askedClinic && !needsClinic) || askedToConnect)) {
      const times = action.filledTimes?.filter(Boolean) ?? [];
      const when = action.filledDate || (times.length ? times.join(", ") : "as written in the discharge notes");
      const where = action.filledClinic ? ` Location: ${action.filledClinic}.` : "";
      result.response = `Reminder confirmed: ${action.label} — ${when}.${where}`.trim();
      result.status = "complete";
    }
    const status =
      result.status === "failed"
        ? "failed"
        : result.status === "working"
          ? "working"
          : result.status === "complete"
            ? "complete"
            : classifyFoResponse(result.response);

    conversations.set(convId, `Task: ${prompt}\n\nAssistant: ${result.response}`);
    setTimeout(() => conversations.delete(convId), 10 * 60 * 1000);

    return NextResponse.json({
      status,
      response: result.response,
      conversationId: convId,
      progress: result.progress,
    });
  } catch (err) {
    console.error("Fo execution error:", err);
    const message = err instanceof Error ? err.message : "";
    return NextResponse.json({
      status: "failed",
      response: message && message.length < 180 ? message : "Execution failed. Please try again.",
      conversationId: "",
    });
  }
}

export async function GET(req: NextRequest) {
  const { error } = await requireUserId();
  if (error) return error;

  const conversationId = req.nextUrl.searchParams.get("conversationId");
  if (conversationId && process.env.WAJO_TOKEN) {
    const reply = await getFoReply(conversationId);
    const status =
      reply.status === "working" || reply.status === "failed"
        ? reply.status
        : classifyFoResponse(reply.response);
    return NextResponse.json({ ...reply, status });
  }

  return NextResponse.json({
    status: "complete",
    response: "Done.",
    conversationId: conversationId ?? "",
  });
}
