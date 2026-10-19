import { execFile } from "child_process";
import { promisify } from "util";
import { askFo, pollUntilDone } from "@/lib/fo-client";

const execFileAsync = promisify(execFile);

export async function runFoPrompt(prompt: string): Promise<string> {
  if (process.env.WAJO_TOKEN) {
    const asked = await askFo(prompt, { newConversation: true });
    const result = asked.status === "working" ? await pollUntilDone(asked.conversationId) : asked;
    return result.response;
  }

  const { stdout } = await execFileAsync(
    "claude",
    ["-p", prompt, "--model", "sonnet", "--effort", "low", "--permission-mode", "bypassPermissions"],
    { timeout: 90000, maxBuffer: 2 * 1024 * 1024 }
  );
  return stdout.trim();
}
