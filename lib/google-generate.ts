export function googleApiKey() {
  return process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY || process.env.GOOGLE_TTS_API_KEY || "";
}

function thinkingLevelFor(model: string) {
  return /3\.8|3\.1-pro|4-argon/.test(model) ? "low" : "minimal";
}

export type GoogleContentPart =
  | { type: "text"; text: string }
  | { type: "image" | "document"; data: string; mime_type: string };

type InteractionBody = {
  error?: { message?: string };
  output_text?: string;
  steps?: Array<{
    type?: string;
    content?: Array<{ type?: string; text?: string }>;
  }>;
};

function textFrom(body: InteractionBody) {
  if (body.output_text?.trim()) return body.output_text.trim();
  const chunks: string[] = [];
  for (const step of body.steps ?? []) {
    if (step.type && step.type !== "model_output") continue;
    for (const part of step.content ?? []) {
      if (part.type && part.type !== "text") continue;
      if (part.text) chunks.push(part.text);
    }
  }
  return chunks.join("").trim();
}

async function requestInteraction(
  model: string,
  options: {
    system: string;
    parts: GoogleContentPart[];
    schema?: unknown;
    maxOutputTokens?: number;
  }
) {
  return fetch("https://generativelanguage.googleapis.com/v1beta/interactions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": googleApiKey(),
    },
    body: JSON.stringify({
      model,
      store: false,
      system_instruction: options.system,
      input: options.parts,
      ...(options.schema
        ? { response_format: { type: "text", mime_type: "application/json", schema: options.schema } }
        : {}),
      generation_config: {
        thinking_level: thinkingLevelFor(model),
        max_output_tokens: options.maxOutputTokens ?? 2500,
      },
    }),
  });
}

export async function generateGoogleText(options: {
  system: string;
  parts: GoogleContentPart[];
  schema?: unknown;
  maxOutputTokens?: number;
}): Promise<string> {
  const preferred = process.env.GEMINI_MODEL ?? "gemini-3.5-flash-lite";
  const models = process.env.GEMINI_MODEL ? [preferred] : [preferred, "gemini-3.8-flash"];
  let failure = "Google request failed.";

  for (const model of models) {
    const response = await requestInteraction(model, options);
    const body = (await response.json().catch(() => null)) as InteractionBody | null;
    if (response.ok) {
      const text = body ? textFrom(body) : "";
      if (text) return text;
      failure = "Google returned an empty reply.";
      break;
    }
    if (body?.error?.message) failure = body.error.message.slice(0, 240);
    if (response.status !== 404 || process.env.GEMINI_MODEL) break;
  }

  throw new Error(failure);
}
