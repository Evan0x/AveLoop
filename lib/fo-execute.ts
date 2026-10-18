import { CLINIC_OPTIONS, type Action } from "@/lib/types";

export function buildFoPrompt(action: Action): string {
  const extras: string[] = [];
  if (action.filledTimes?.some(Boolean)) extras.push(`Medication times: ${action.filledTimes.filter(Boolean).join(", ")}`);
  if (action.filledDate) extras.push(`Appointment date: ${action.filledDate}`);
  if (action.filledClinic) extras.push(`Chosen clinic: ${action.filledClinic}`);

  const needsClinic = action.missing?.includes("clinic") && !action.filledClinic;
  const clinicAsk = needsClinic
    ? `\nThe clinic is ambiguous. Ask which one, listing:\n- ${CLINIC_OPTIONS.join("\n- ")}`
    : "";

  const toolHint =
    action.type === "calendar"
      ? "Use Google Calendar. Create the event(s) now if authorized."
      : action.type === "email"
        ? "Use Gmail. Draft and send if authorized; otherwise ask to connect Gmail."
        : "Use Calendar, Gmail, or web tools if they help complete the task.";

  return `You are Fo, executing one patient care-plan action.

${toolHint}

Action: ${action.label}
Instructions: ${action.instruction}${extras.length ? `\n${extras.join("\n")}` : ""}${clinicAsk}

If a Google/Gmail connector needs authorization, say so clearly and ask the user to reply "connected" after they authorize.
If you need a choice (clinic, date, time), ask one short question.
If you completed the task, reply in 1-2 sentences with what you did (include event time or email recipient when possible).`;
}

export function classifyFoResponse(response: string): "needs_clarification" | "complete" {
  const text = response.toLowerCase();
  if (
    /authoriz|oauth|connect (them|gmail|google|calendar)|hasn't been (set up|authenticated)|please authorize/.test(
      text
    )
  ) {
    return "needs_clarification";
  }
  if (
    text.includes("?") ||
    /which (clinic|location|one)|need to know|tell me|reply with/.test(text)
  ) {
    return "needs_clarification";
  }
  return "complete";
}
