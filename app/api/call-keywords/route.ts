import { NextRequest, NextResponse } from "next/server";
import { generateGoogleText } from "@/lib/google-generate";

const SCHEMA = {
  type: "object",
  properties: {
    keywords: { type: "array", items: { type: "string" } },
  },
  required: ["keywords"],
};

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as { transcript?: string; purpose?: string } | null;
  const transcript = body?.transcript?.trim() ?? "";
  if (!transcript) return NextResponse.json({ keywords: [] });

  try {
    const text = await generateGoogleText({
      system:
        "Pull the useful facts out of what the person on the phone said. Return 2 to 6 short keywords or phrases, such as a time, a date, ready today, or not ready. Do not add facts that were not said.",
      parts: [
        {
          type: "text",
          text: `Why Fo called: ${body?.purpose?.trim() || "a care follow-up"}\nThey said: ${transcript}`,
        },
      ],
      schema: SCHEMA,
      maxOutputTokens: 200,
    });
    const parsed = JSON.parse(text) as { keywords?: unknown };
    const keywords = Array.isArray(parsed.keywords)
      ? parsed.keywords.filter((item): item is string => typeof item === "string" && item.trim().length > 0).slice(0, 6)
      : [];
    return NextResponse.json({ keywords });
  } catch {
    return NextResponse.json({ keywords: fallbackKeywords(transcript) });
  }
}

function fallbackKeywords(transcript: string) {
  const skip = new Set([
    "hello", "this", "that", "with", "from", "have", "your", "they", "them", "what", "when", "just", "about", "would", "could", "please",
  ]);
  const words = transcript.toLowerCase().match(/[a-z0-9']+/g) ?? [];
  const keywords: string[] = [];
  for (const word of words) {
    if (word.length < 4 || skip.has(word) || keywords.includes(word)) continue;
    keywords.push(word);
    if (keywords.length === 6) break;
  }
  return keywords;
}
