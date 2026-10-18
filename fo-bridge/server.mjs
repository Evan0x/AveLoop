import http from "http";
import { execFile } from "child_process";
import { randomUUID } from "crypto";

const EXTRACT_PROMPT = (notes) => `Extract the care plan from these discharge notes and return ONLY valid JSON (no explanation, no markdown fences) matching exactly this structure:
{"medications":[{"name":"string","dose":"string","schedule":"string","duration_days":null}],"followups":[{"reason":"string","date":"string","clinic":null}],"warnings":["string"],"care_instructions":["string"],"actions":[{"id":"action_1","type":"task","label":"string","instruction":"string","status":"ready","missing":[],"result":null}],"needs_clarification":["string"]}

Rules:
- Generate 4-6 actionable steps the patient must take
- status="ready" when all details are clear and specific
- status="needs_input" when times, dates, or clinic are vague or missing
- missing=["times"] for vague medication schedule times, ["dates"] for vague appointment dates, ["clinic"] when clinic is ambiguous
- Make labels concise and action-oriented (max 8 words)
- type must be one of: "task", "calendar", or "email"

Discharge notes:
${notes}`;

const FO_EXEC_PROMPT = (instruction) => `You are executing a patient healthcare follow-up action. Complete this specific task using your available tools (Google Calendar for appointments, Gmail for emails, etc.):

${instruction}

Respond in 1-2 sentences: what you did, or what clarification you need.`;

// In-memory conversation history for multi-turn clarification
const conversations = new Map();

function runClaude(prompt, timeoutMs = 90000) {
  return new Promise((resolve, reject) => {
    execFile(
      "claude",
      ["-p", prompt, "--allow-dangerously-skip-permissions"],
      { timeout: timeoutMs, maxBuffer: 2 * 1024 * 1024 },
      (err, stdout) => {
        if (err) reject(err);
        else resolve(stdout.trim());
      }
    );
  });
}

async function readBody(req) {
  let body = "";
  for await (const chunk of req) body += chunk;
  return body;
}

const server = http.createServer(async (req, res) => {
  res.setHeader("Content-Type", "application/json");

  try {
    const body = await readBody(req);

    // POST /extract — extract care plan JSON from discharge notes
    if (req.method === "POST" && req.url === "/extract") {
      const { notes } = JSON.parse(body);
      if (!notes) {
        res.writeHead(400);
        return res.end(JSON.stringify({ error: "Missing notes" }));
      }

      const raw = await runClaude(EXTRACT_PROMPT(notes));
      const jsonText = raw
        .replace(/^```(?:json)?\n?/m, "")
        .replace(/\n?```$/m, "")
        .trim();

      const data = JSON.parse(jsonText);
      res.writeHead(200);
      return res.end(JSON.stringify(data));
    }

    // POST /fo — execute an action or continue a clarification
    if (req.method === "POST" && req.url === "/fo") {
      const { action, conversationId, replyMessage } = JSON.parse(body);

      let prompt;
      let convId = conversationId;

      if (replyMessage && conversationId) {
        // Continuing an existing conversation
        const history = conversations.get(conversationId) || "";
        prompt = `${history}\n\nUser reply: ${replyMessage}\n\nProceed with the task based on this answer. Respond in 1-2 sentences.`;
      } else if (action) {
        // New action
        convId = randomUUID();
        const parts = [action.instruction];
        if (action.filledTimes?.length) parts.push(`Medication times: ${action.filledTimes.join(", ")}`);
        if (action.filledDate) parts.push(`Appointment date: ${action.filledDate}`);
        if (action.filledClinic) parts.push(`Clinic: ${action.filledClinic}`);
        prompt = FO_EXEC_PROMPT(parts.join(". "));
      } else {
        res.writeHead(400);
        return res.end(JSON.stringify({ error: "Missing action or replyMessage" }));
      }

      const response = await runClaude(prompt);

      // Save history for potential follow-up
      conversations.set(convId, `Task: ${prompt}\n\nAssistant: ${response}`);
      // Clean up old conversations after 10 min
      setTimeout(() => conversations.delete(convId), 10 * 60 * 1000);

      res.writeHead(200);
      return res.end(
        JSON.stringify({ status: "complete", response, conversationId: convId })
      );
    }

    // GET /fo?conversationId=xxx — polled by execute page (bridge is synchronous, always done)
    if (req.method === "GET" && req.url?.startsWith("/fo")) {
      res.writeHead(200);
      return res.end(
        JSON.stringify({ status: "complete", response: "Done.", conversationId: "" })
      );
    }

    res.writeHead(404);
    res.end(JSON.stringify({ error: "Not found" }));
  } catch (err) {
    console.error(err);
    res.writeHead(500);
    res.end(JSON.stringify({ error: err.message || "Bridge error" }));
  }
});

const PORT = 3002;
server.listen(PORT, () => console.log(`fo-bridge running on http://localhost:${PORT}`));
