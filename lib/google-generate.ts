function cleanKey(value: string | undefined) {
  return (value ?? "").trim().replace(/^['"]|['"]$/g, "");
}

const KEY_NAMES = ["GOOGLE_GEMINI_API_KEY", "GEMINI_API_KEY", "GOOGLE_API_KEY", "GOOGLE_TTS_API_KEY"];

export function googleApiKeys() {
  const seen = new Set<string>();
  const keys: string[] = [];
  for (const name of KEY_NAMES) {
    const key = cleanKey(process.env[name]);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    keys.push(key);
  }
  return keys;
}

export function googleApiKey() {
  return googleApiKeys()[0] ?? "";
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

function failureMessage(status: number, body: unknown, raw: string) {
  const entries = Array.isArray(body) ? body : [body];
  for (const entry of entries) {
    if (!entry || typeof entry !== "object") continue;
    const record = entry as { error?: { message?: string } | string; message?: string };
    if (typeof record.error === "string" && record.error.trim()) return record.error.trim().slice(0, 240);
    if (record.error && typeof record.error === "object" && record.error.message) {
      return record.error.message.trim().slice(0, 240);
    }
    if (typeof record.message === "string" && record.message.trim()) return record.message.trim().slice(0, 240);
  }
  const snippet = raw.replace(/\s+/g, " ").trim().slice(0, 180);
  return snippet || `Google request failed (${status}).`;
}

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

function keyRejected(message: string) {
  return /are blocked|api key not valid|permission denied/i.test(message);
}

async function requestInteraction(
  key: string,
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
      "x-goog-api-key": key,
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
  const keys = googleApiKeys();
  let failure = keys.length ? "Google request failed." : "Google API key is not configured.";

  for (const key of keys) {
    let tryNextKey = false;
    for (const model of models) {
      const response = await requestInteraction(key, model, options);
      const raw = await response.text();
      let body: unknown = null;
      try {
        body = raw ? JSON.parse(raw) : null;
      } catch {
        body = null;
      }
      if (response.ok) {
        const text = body && !Array.isArray(body) ? textFrom(body as InteractionBody) : "";
        if (text) return text;
        failure = "Google returned an empty reply.";
        tryNextKey = false;
        break;
      }
      failure = failureMessage(response.status, body, raw);
      if (keyRejected(failure)) {
        tryNextKey = true;
        break;
      }
      if (response.status !== 404 || process.env.GEMINI_MODEL) break;
    }
    if (!tryNextKey) break;
  }

  throw new Error(failure);
}
