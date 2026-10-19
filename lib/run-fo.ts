import { execFile } from "child_process";
import { promisify } from "util";
import { askFo, pollUntilDone } from "@/lib/fo-client";
import { generateGoogleText, googleApiKey } from "@/lib/google-generate";

const execFileAsync = promisify(execFile);

const FO_SYSTEM =
  "You are Fo. Reply in 1-2 sentences confirming the care step: title, date or times, and location from the task. Ask which clinic only when the task says the clinic is ambiguous. Medication reminders, pharmacy pickup, and blood work are not clinic questions. Do not claim a Google Calendar event or email was created. Do not add any other question.";

async function runWithGoogle(prompt: string): Promise<string> {
  return generateGoogleText({
    system: FO_SYSTEM,
    parts: [{ type: "text", text: prompt }],
    maxOutputTokens: 300,
  });
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
