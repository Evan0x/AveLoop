import { NextRequest, NextResponse } from "next/server";
import { execFile } from "child_process";
import { promisify } from "util";
import type { Action } from "@/lib/types";
import { requireUserId } from "@/lib/auth";
import { askFo, getFoReply, pollUntilDone, type FoResult } from "@/lib/fo-client";
import { buildFoPrompt, classifyFoResponse } from "@/lib/fo-execute";

const execFileAsync = promisify(execFile);

export const maxDuration = 120;

const conversations = new Map<string, string>();

async function runClaude(prompt: string): Promise<string> {
  const { stdout } = await execFileAsync(
    "claude",
    [
      "-p",
      prompt,
      "--model",
      "sonnet",
      "--effort",
      "low",
      "--permission-mode",
      "bypassPermissions",
    ],
    { timeout: 90000, maxBuffer: 2 * 1024 * 1024 }
  );
  return stdout.trim();
}

async function runAgent(prompt: string, conversationId?: string): Promise<FoResult> {
  if (process.env.WAJO_TOKEN) {
    const asked = await askFo(prompt, conversationId ? { conversationId } : { newConversation: true });
    if (asked.status === "working") return pollUntilDone(asked.conversationId);
    return asked;
  }

  const response = await runClaude(prompt);
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

    if (replyMessage && conversationId) {
      const history = conversations.get(conversationId) ?? "";
      prompt = `${history}\n\nUser reply: ${replyMessage}\n\nContinue and finish the task if you can. One or two sentences.`;
    } else if (action) {
      convId = crypto.randomUUID();
      prompt = buildFoPrompt(action);
    } else {
      return NextResponse.json({ error: "Missing action or replyMessage" }, { status: 400 });
    }

    const result = await runAgent(prompt, convId);
    convId = result.conversationId || convId;
    const status =
      result.status === "failed"
        ? "failed"
        : result.status === "working"
          ? "working"
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
    return NextResponse.json({
      status: "failed",
      response: "Execution failed. Please try again.",
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
