import Anthropic from "@anthropic-ai/sdk";
import { jsonSchemaOutputFormat } from "@anthropic-ai/sdk/helpers/json-schema";
import { execFile } from "child_process";
import { promisify } from "util";
import { unlink, writeFile } from "fs/promises";
import { tmpdir } from "os";
import path from "path";
import type { Action, CareData } from "@/lib/types";
import { enrichCarePlan } from "@/lib/enrich-care-plan";
import { generateGoogleText, googleApiKey, type GoogleContentPart } from "@/lib/google-generate";

const execFileAsync = promisify(execFile);

export interface ExtractAttachment {
  name: string;
  type: string;
  buffer: Buffer;
}

const SYSTEM_PROMPT = `Extract a patient care plan from discharge notes or a discharge document photo/PDF.
Rules:
- Generate 4-6 actionable steps the patient must take, plus calendar reminder actions for each medication
- status="ready" when all details are clear and specific
- status="needs_input" when times or dates are vague
- missing=["times"] for vague medication schedule times, ["dates"] for vague appointment dates, ["clinic"] when clinic is ambiguous
- Do not require the patient to pick a clinic in advance when the name is ambiguous — mark missing=["clinic"] so Fo can ask
- Make labels concise and action-oriented (max 8 words)
- type must be one of: "task", "calendar", or "email"
- Prefer type="calendar" for appointments and medication reminders
- Prefer type="email" for contacting a clinic, lab, or pharmacy`;

const CARE_DATA_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "medications",
    "followups",
    "warnings",
    "care_instructions",
    "actions",
    "needs_clarification",
  ],
  properties: {
    medications: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "dose", "schedule", "duration_days"],
        properties: {
          name: { type: "string" },
          dose: { type: "string" },
          schedule: { type: "string" },
          duration_days: { anyOf: [{ type: "integer" }, { type: "null" }] },
        },
      },
    },
    followups: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["reason", "date", "clinic"],
        properties: {
          reason: { type: "string" },
          date: { type: "string" },
          clinic: { anyOf: [{ type: "string" }, { type: "null" }] },
        },
      },
    },
    warnings: { type: "array", items: { type: "string" } },
    care_instructions: { type: "array", items: { type: "string" } },
    actions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "type", "label", "instruction", "status", "missing", "result"],
        properties: {
          id: { type: "string" },
          type: { type: "string", enum: ["task", "calendar", "email"] },
          label: { type: "string" },
          instruction: { type: "string" },
          status: { type: "string", enum: ["ready", "needs_input"] },
          missing: { type: "array", items: { type: "string" } },
          result: { anyOf: [{ type: "string" }, { type: "null" }] },
        },
      },
    },
    needs_clarification: { type: "array", items: { type: "string" } },
  },
} as const;

function normalizeCareData(raw: unknown): CareData {
  const data = (raw ?? {}) as Partial<CareData>;
  const actions = Array.isArray(data.actions) ? data.actions : [];

  return {
    medications: Array.isArray(data.medications) ? data.medications : [],
    followups: Array.isArray(data.followups) ? data.followups : [],
    warnings: Array.isArray(data.warnings) ? data.warnings : [],
    care_instructions: Array.isArray(data.care_instructions) ? data.care_instructions : [],
    actions: actions.map((action, index) => {
      const item = action as Action;
      return {
        id: item.id || `action_${index + 1}`,
        type: item.type === "calendar" || item.type === "email" ? item.type : "task",
        label: item.label ?? "",
        instruction: item.instruction ?? "",
        status: item.status === "needs_input" ? "needs_input" : "ready",
        missing: Array.isArray(item.missing) ? item.missing : [],
        result: item.result ?? undefined,
      };
    }),
    needs_clarification: Array.isArray(data.needs_clarification) ? data.needs_clarification : [],
  };
}

function parseJsonPayload(text: string): unknown {
  const trimmed = text
    .replace(/^```(?:json)?\n?/m, "")
    .replace(/\n?```$/m, "")
    .trim();

  const parsed = JSON.parse(trimmed) as unknown;
  if (parsed && typeof parsed === "object") {
    const record = parsed as Record<string, unknown>;
    if ("medications" in record) return parsed;
    if (typeof record.result === "string") return JSON.parse(record.result);
    if (record.result && typeof record.result === "object") return record.result;
  }
  return parsed;
}

function userText(notes: string, hasFile: boolean) {
  if (notes.trim()) return notes.trim();
  if (hasFile) return "Extract the care plan from this discharge document.";
  return "";
}

const GEMINI_SCHEMA = {
  type: "object",
  required: ["medications", "followups", "warnings", "care_instructions", "actions", "needs_clarification"],
  properties: {
    medications: {
      type: "array",
      items: {
        type: "object",
        required: ["name", "dose", "schedule", "duration_days"],
        properties: {
          name: { type: "string" },
          dose: { type: "string" },
          schedule: { type: "string" },
          duration_days: { type: "integer", nullable: true },
        },
      },
    },
    followups: {
      type: "array",
      items: {
        type: "object",
        required: ["reason", "date", "clinic"],
        properties: {
          reason: { type: "string" },
          date: { type: "string" },
          clinic: { type: "string", nullable: true },
        },
      },
    },
    warnings: { type: "array", items: { type: "string" } },
    care_instructions: { type: "array", items: { type: "string" } },
    actions: {
      type: "array",
      items: {
        type: "object",
        required: ["id", "type", "label", "instruction", "status", "missing", "result"],
        properties: {
          id: { type: "string" },
          type: { type: "string", enum: ["task", "calendar", "email"] },
          label: { type: "string" },
          instruction: { type: "string" },
          status: { type: "string", enum: ["ready", "needs_input"] },
          missing: { type: "array", items: { type: "string" } },
          result: { type: "string", nullable: true },
        },
      },
    },
    needs_clarification: { type: "array", items: { type: "string" } },
  },
};

async function extractWithGoogle(notes: string, attachment?: ExtractAttachment): Promise<CareData> {
  const parts: GoogleContentPart[] = [];
  if (attachment) {
    const mime = attachment.type || "application/octet-stream";
    parts.push({
      type: mime.startsWith("image/") ? "image" : "document",
      data: attachment.buffer.toString("base64"),
      mime_type: mime,
    });
  }
  parts.push({ type: "text", text: userText(notes, Boolean(attachment)) });

  const text = await generateGoogleText({
    system: SYSTEM_PROMPT,
    parts,
    schema: GEMINI_SCHEMA,
    maxOutputTokens: 2500,
  });
  return normalizeCareData(JSON.parse(text));
}

async function extractWithApi(notes: string, attachment?: ExtractAttachment): Promise<CareData> {
  const client = new Anthropic();
  const content: Anthropic.MessageCreateParams["messages"][number]["content"] = [];

  if (attachment) {
    const data = attachment.buffer.toString("base64");
    if (attachment.type === "application/pdf") {
      content.push({
        type: "document",
        source: { type: "base64", media_type: "application/pdf", data },
      } as Anthropic.ContentBlockParam);
    } else {
      const mediaType = (attachment.type || "image/jpeg") as
        | "image/jpeg"
        | "image/png"
        | "image/gif"
        | "image/webp";
      content.push({
        type: "image",
        source: { type: "base64", media_type: mediaType, data },
      });
    }
  }

  content.push({ type: "text", text: userText(notes, Boolean(attachment)) });

  const message = await client.messages.parse({
    model: process.env.ANTHROPIC_MODEL ?? "claude-haiku-4-5",
    max_tokens: 1800,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content }],
    output_config: {
      format: jsonSchemaOutputFormat(CARE_DATA_JSON_SCHEMA),
    },
  });

  return normalizeCareData(message.parsed_output);
}

async function extractWithCli(notes: string, attachment?: ExtractAttachment): Promise<CareData> {
  let filePath: string | null = null;
  const args = [
    "-p",
    "",
    "--model",
    "haiku",
    "--effort",
    "low",
    "--safe-mode",
    "--disable-slash-commands",
    "--no-session-persistence",
    "--strict-mcp-config",
    "--system-prompt",
    SYSTEM_PROMPT,
    "--json-schema",
    JSON.stringify(CARE_DATA_JSON_SCHEMA),
    "--output-format",
    "json",
  ];

  try {
    if (attachment) {
      const safeName = attachment.name.replace(/[^\w.-]+/g, "_");
      filePath = path.join(tmpdir(), `aveloop-${Date.now()}-${safeName}`);
      await writeFile(filePath, attachment.buffer);
      args[1] = `${userText(notes, true)}\n\nThe discharge document is at: ${filePath}`;
      args.push("--tools", "Read", "--add-dir", tmpdir());
    } else {
      args[1] = userText(notes, false);
      args.push("--tools", "");
    }

    const { stdout } = await execFileAsync("claude", args, {
      timeout: 60000,
      maxBuffer: 2 * 1024 * 1024,
    });
    return normalizeCareData(parseJsonPayload(stdout));
  } finally {
    if (filePath) await unlink(filePath).catch(() => {});
  }
}

export async function extractCarePlan(notes: string, attachment?: ExtractAttachment): Promise<CareData> {
  const raw = googleApiKey()
    ? await extractWithGoogle(notes, attachment)
    : process.env.ANTHROPIC_API_KEY
      ? await extractWithApi(notes, attachment)
      : await extractWithCli(notes, attachment);
  return enrichCarePlan(raw);
}
