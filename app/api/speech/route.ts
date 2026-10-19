import { NextRequest, NextResponse } from "next/server";
import { requireUserId } from "@/lib/auth";

export const maxDuration = 30;

const MODELS = ["gemini-3.8-flash-lite-tts", "gemini-3.8-flash-tts"];

type SpeechBody = {
  error?: { message?: string };
  steps?: Array<{
    content?: Array<{ type?: string; data?: string; mime_type?: string }>;
  }>;
};

function audioPart(body: SpeechBody) {
  for (const step of body.steps ?? []) {
    for (const part of step.content ?? []) {
      if (part.type === "audio" && part.data) return part;
    }
  }
  return null;
}

export async function POST(req: NextRequest) {
  const { error } = await requireUserId();
  if (error) return error;

  const key = [process.env.GOOGLE_TTS_API_KEY, process.env.GOOGLE_API_KEY, process.env.GEMINI_API_KEY]
    .map((value) => (value ?? "").trim().replace(/^['"]|['"]$/g, ""))
    .find(Boolean);
  if (!key) {
    return NextResponse.json({ error: "Text-to-speech is not configured." }, { status: 503 });
  }

  const body = await req.json().catch(() => null);
  const text = typeof body?.text === "string" ? body.text.trim().slice(0, 4500) : "";
  if (!text) {
    return NextResponse.json({ error: "Nothing to speak." }, { status: 400 });
  }

  let failure = "Could not synthesize speech.";
  for (const model of MODELS) {
    const response = await fetch("https://generativelanguage.googleapis.com/v1beta/interactions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": key,
      },
      body: JSON.stringify({
        model,
        input: [
          {
            type: "user_input",
            content: [
              {
                type: "text",
                text,
                annotations: [{ type: "speech_metadata", style: "calm and clear" }],
              },
            ],
          },
        ],
        response_format: { type: "audio" },
        generation_config: {
          speech_config: [{ voice: "Aoede" }],
        },
      }),
    });

    const data = (await response.json().catch(() => null)) as SpeechBody | null;
    const audio = data ? audioPart(data) : null;
    if (!response.ok || !audio?.data) {
      if (data?.error?.message) failure = data.error.message.slice(0, 180);
      if (response.status !== 404) break;
      continue;
    }

    const bytes = Buffer.from(audio.data, "base64");
    const mime = audio.mime_type?.startsWith("audio/") ? audio.mime_type : "audio/wav";
    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        "Content-Type": mime,
        "Content-Length": String(bytes.length),
        "Cache-Control": "no-store",
      },
    });
  }

  return NextResponse.json({ error: failure }, { status: 502 });
}
