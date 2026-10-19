import { NextRequest, NextResponse } from "next/server";
import { requireUserId } from "@/lib/auth";
import { googleApiKeys } from "@/lib/google-generate";

export const maxDuration = 30;

const CLOUD_VOICES = ["en-US-Neural2-H", "en-US-Neural2-C"];

type CloudBody = {
  audioContent?: string;
  error?: { message?: string };
};

function audioResponse(base64: string, mime: string) {
  const bytes = Buffer.from(base64, "base64");
  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      "Content-Type": mime,
      "Content-Length": String(bytes.length),
      "Cache-Control": "no-store",
    },
  });
}

function errorMessage(body: unknown, raw: string) {
  const entries = Array.isArray(body) ? body : [body];
  for (const entry of entries) {
    if (!entry || typeof entry !== "object") continue;
    const record = entry as { error?: { message?: string } | string; message?: string };
    if (typeof record.error === "string" && record.error.trim()) return record.error.trim();
    if (record.error && typeof record.error === "object" && record.error.message) return record.error.message.trim();
    if (typeof record.message === "string" && record.message.trim()) return record.message.trim();
  }
  return raw.replace(/\s+/g, " ").trim();
}

async function synthesizeCloud(key: string, text: string, voice: string) {
  const response = await fetch("https://texttospeech.googleapis.com/v1/text:synthesize", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": key,
    },
    body: JSON.stringify({
      input: { text },
      voice: { languageCode: "en-US", name: voice },
      audioConfig: { audioEncoding: "MP3", speakingRate: 0.92, pitch: -1.5 },
    }),
  });
  const raw = await response.text();
  let body: CloudBody | CloudBody[] | null = null;
  try {
    body = raw ? (JSON.parse(raw) as CloudBody | CloudBody[]) : null;
  } catch {
    body = null;
  }
  const audio = body && !Array.isArray(body) ? body.audioContent : undefined;
  return { ok: response.ok && Boolean(audio), status: response.status, audio, failure: errorMessage(body, raw).slice(0, 180) };
}

export async function POST(req: NextRequest) {
  const { error } = await requireUserId();
  if (error) return error;

  const keys = googleApiKeys();
  if (!keys.length) {
    return NextResponse.json({ error: "Text-to-speech is not configured." }, { status: 503 });
  }

  const body = await req.json().catch(() => null);
  const text = typeof body?.text === "string" ? body.text.trim().slice(0, 4500) : "";
  if (!text) {
    return NextResponse.json({ error: "Nothing to speak." }, { status: 400 });
  }

  let failure = "Could not synthesize speech.";
  for (const key of keys) {
    for (const voice of CLOUD_VOICES) {
      const result = await synthesizeCloud(key, text, voice);
      if (result.ok && result.audio) return audioResponse(result.audio, "audio/mpeg");
      failure = result.failure || failure;
      const blocked =
        result.status === 401 ||
        result.status === 403 ||
        /are blocked|api key not valid|permission denied|expected oauth/i.test(failure);
      if (blocked) break;
      if (/does not exist|not supported for this voice|invalid voice/i.test(failure)) continue;
      if (result.status !== 404) break;
    }
  }

  return NextResponse.json({ error: failure }, { status: 502 });
}
