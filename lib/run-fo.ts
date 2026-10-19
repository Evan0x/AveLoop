import { execFile } from "child_process";
import { promisify } from "util";
import { askFo, pollUntilDone } from "@/lib/fo-client";

const execFileAsync = promisify(execFile);

function googleApiKey() {
  return process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY || process.env.GOOGLE_TTS_API_KEY || "";
}

function thinkingLevelFor(model: string) {
  return /3\.8|3\.1-pro|4-argon/.test(model) ? "LOW" : "MINIMAL";
}

async function requestGemini(model: string, prompt: string) {
  return fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": googleApiKey(),
    },
    body: JSON.stringify({
      systemInstruction: {
        parts: [
          {
            text: "You are Fo. Reply in 1-2 sentences confirming the care step: title, date or times, and location from the task. Ask which clinic only when the task says the clinic is ambiguous. Medication reminders, pharmacy pickup, and blood work are not clinic questions. Do not claim a Google Calendar event or email was created. Do not add any other question.",
          },
        ],
      },
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: {
        maxOutputTokens: 300,
        thinkingConfig: { thinkingLevel: thinkingLevelFor(model), includeThoughts: false },
      },
    }),
  });
}

async function runWithGoogle(prompt: string): Promise<string> {
  const preferred = process.env.GEMINI_MODEL ?? "gemini-3.5-flash-lite";
  let response = await requestGemini(preferred, prompt);
  if (response.status === 404 && !process.env.GEMINI_MODEL && preferred !== "gemini-3.8-flash") {
    response = await requestGemini("gemini-3.8-flash", prompt);
  }
  const body = (await response.json()) as {
    error?: { message?: string };
    candidates?: Array<{ content?: { parts?: Array<{ text?: string; thought?: boolean }> } }>;
  };
  if (!response.ok) throw new Error(body.error?.message || "Google execution failed.");
  const text =
    body.candidates?.[0]?.content?.parts
      ?.filter((part) => !part.thought)
      .map((part) => part.text ?? "")
      .join("")
      .trim() ?? "";
  if (!text) throw new Error("Google returned an empty reply.");
  return text;
}

export async function runFoPrompt(prompt: string): Promise<string> {
  if (process.env.WAJO_TOKEN) {
    const asked = await askFo(prompt, { newConversation: true });
    const result = asked.status === "working" ? await pollUntilDone(asked.conversationId) : asked;
    return result.response;
  }

  if (googleApiKey()) return runWithGoogle(prompt);

  const { stdout } = await execFileAsync(
    "claude",
    ["-p", prompt, "--model", "sonnet", "--effort", "low", "--permission-mode", "bypassPermissions"],
    { timeout: 90000, maxBuffer: 2 * 1024 * 1024 }
  );
  return stdout.trim();
}
