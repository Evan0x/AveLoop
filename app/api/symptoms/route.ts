import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { triageSymptom } from "@/lib/symptoms";
import { askFo, pollUntilDone } from "@/lib/fo-client";
import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const { isAuthenticated } = await auth();

  const body = await req.json();
  const text = typeof body.text === "string" ? body.text.trim() : "";
  if (!text) {
    return NextResponse.json({ error: "Describe the symptom." }, { status: 400 });
  }

  const triage = triageSymptom(text);
  if (triage.level === "emergency" || !isAuthenticated) {
    return NextResponse.json({ ...triage, foResponse: null });
  }

  const prompt = `Patient discharged recently. They report: "${text}".
Local triage: ${triage.title}. ${triage.advice}
In 2 sentences: should they go to the ER, call the clinic, or monitor at home? Be conservative about safety.`;

  try {
    let foResponse: string;
    if (process.env.WAJO_TOKEN) {
      const asked = await askFo(prompt, { newConversation: true });
      const done = asked.status === "working" ? await pollUntilDone(asked.conversationId) : asked;
      foResponse = done.response;
    } else {
      const { stdout } = await execFileAsync(
        "claude",
        ["-p", prompt, "--model", "haiku", "--effort", "low", "--tools", ""],
        { timeout: 30000, maxBuffer: 512 * 1024 }
      );
      foResponse = stdout.trim();
    }
    return NextResponse.json({ ...triage, foResponse });
  } catch {
    return NextResponse.json({ ...triage, foResponse: null });
  }
}
