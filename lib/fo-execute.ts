import { CLINIC_OPTIONS, type Action } from "@/lib/types";

export function buildFoPrompt(action: Action): string {
  const extras: string[] = [];
  const times = action.filledTimes?.some(Boolean)
    ? action.filledTimes.filter(Boolean)
    : action.missing?.includes("times")
      ? ["08:00", "12:00", "18:00"]
      : [];
  if (times.length) extras.push(`Medication times: ${times.join(", ")}`);
  if (action.filledDate) {
    extras.push(`Appointment date: ${action.filledDate}. Use this date. Do not ask for another date.`);
  }
  if (action.filledClinic) extras.push(`Chosen clinic: ${action.filledClinic}`);

  const needsClinic = action.missing?.includes("clinic") && !action.filledClinic;
  const clinicAsk = needsClinic
    ? `\nThe clinic is ambiguous. Ask which one, and do not create an event until they answer. List only:\n- ${CLINIC_OPTIONS.join("\n- ")}`
    : action.filledClinic
      ? `\nThe patient chose this clinic: ${action.filledClinic}. Create the calendar event at that location now. Do not ask which clinic.`
      : "";

  const toolHint = needsClinic
    ? "Ask one short question so the patient can pick a clinic. Do not email, call, or search for the clinic."
    : action.type === "calendar"
      ? "Use Google Calendar. Create the event now. Do not email, call, or search the web."
      : action.type === "email"
        ? "Use Gmail. Draft and send if authorized; otherwise ask to connect Gmail."
        : "Use Calendar, Gmail, or web tools if they help complete the task.";

  const closing = needsClinic
    ? "Ask which clinic in one short question. Do not book anything in this reply."
    : `If a Google/Gmail connector needs authorization, say so clearly and ask the user to reply "connected" after they authorize.
If you completed the task, reply in 1-2 sentences with the event title, date, and location. Do not ask whether to proceed.`;

  return `You are Fo, executing one patient care-plan action.

${toolHint}

Action: ${action.label}
Instructions: ${action.instruction}${extras.length ? `\n${extras.join("\n")}` : ""}${clinicAsk}

${closing}`;
}

const SPECIFIC_SITE = /vincennes|poplar|alexandria|williamsburg/i;

function hasNamedSite(text: string) {
  const withoutChoices = CLINIC_OPTIONS.reduce(
    (haystack, option) => haystack.split(option).join(" "),
    text
  );
  const prose = withoutChoices.split(/locations:/i)[0].split(/ask the patient which/i)[0];
  return SPECIFIC_SITE.test(prose);
}

export function prepareActionForFo(action: Action): Action {
  const text = `${action.label} ${action.instruction}`;
  if (!/dr\.?\s*rivera|riverside family clinic/i.test(text)) return action;

  const when = action.filledDate
    ? `Use ${action.filledDate} as the event date.`
    : "The discharge says about 2 weeks. If the patient did not pick a date, use 14 days from today.";

  if (action.filledClinic || hasNamedSite(text)) {
    const location = action.filledClinic ?? "the clinic site already named in the notes";
    return {
      ...action,
      type: "calendar",
      instruction: `Create one 30-minute Google Calendar event titled "Follow-up with Dr. Rivera". ${when} Location: ${location}. Do not email, call, or search the web.`,
    };
  }

  const missing = new Set(action.missing ?? []);
  missing.add("clinic");
  return {
    ...action,
    type: "calendar",
    missing: [...missing],
    instruction: `Create one 30-minute Google Calendar event titled "Follow-up with Dr. Rivera". ${when} Discharge clinic: Riverside Family Clinic, site not specified. Put the patient's chosen location on the event. Do not email, call, or search the web. Locations: ${CLINIC_OPTIONS.join(" | ")}.`,
  };
}

export function clinicFromReply(reply: string): string | undefined {
  return CLINIC_OPTIONS.find((option) => reply === option || reply.includes(option));
}

export function classifyFoResponse(response: string): "needs_clarification" | "complete" {
  const text = response.toLowerCase();
  const failed = /could not|couldn't|unable|failed|can't|cannot/.test(text);
  const asksClinic = /which (clinic|location|one)|pick (a |the )?(clinic|location|one)/.test(text);
  const created =
    /\b(created|scheduled|added|booked)\b[\s\S]{0,80}\b(event|appointment|follow-up|follow up|reminder|calendar)\b/.test(
      text
    );
  if (created && !failed && !asksClinic) return "complete";

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

export function isSchedulableAction(action: Action) {
  const text = `${action.label} ${action.instruction}`.toLowerCase();
  return action.type === "calendar" || /appointment|booking|follow-?up|calendar/.test(text);
}

export function buildCalendarDeletePrompt(actions: Action[]): string | null {
  const targets = actions.filter(isSchedulableAction);
  if (targets.length === 0) return null;

  const lines = targets.map((action, index) => {
    const title = action.instruction.match(/titled "([^"]+)"/i)?.[1] ?? action.label;
    return [
      `${index + 1}. Title: ${title}`,
      action.filledDate ? `Date: ${action.filledDate}` : "",
      action.filledTimes?.some(Boolean) ? `Times: ${action.filledTimes.filter(Boolean).join(", ")}` : "",
      action.filledClinic ? `Location: ${action.filledClinic}` : "",
      action.result ? `Previous result: ${action.result}` : "",
    ]
      .filter(Boolean)
      .join("\n");
  });

  return `You are Fo. Delete only the Google Calendar events, appointments, and bookings listed below. These were created for one care plan.

Use Google Calendar. Delete each match now, including a recurring medication reminder and its whole series. Do not delete any other event. Do not create events. Do not send email. Do not ask for confirmation. If a listed event is already gone, continue with the rest.

Events to delete:
${lines.join("\n\n")}

Reply in 1-2 sentences listing what you deleted. Do not ask a question.`;
}

export function classifyDeleteResponse(response: string): "complete" | "failed" {
  const text = response.toLowerCase().trim();
  if (!text) return "failed";
  if (
    /could not delete|couldn't delete|unable to delete|failed to delete|can't delete|cannot delete|authoriz|connect (google|calendar|gmail)|which calendar/.test(
      text
    )
  ) {
    return "failed";
  }
  if (
    /deleted|removed|cancell?ed|already gone|not found|no matching|nothing to delete|couldn't find|could not find/.test(
      text
    )
  ) {
    return "complete";
  }
  return "failed";
}

export function shouldOfferClinicChoices(message: string | undefined, missingClinic: boolean): boolean {
  if (!message) return missingClinic;
  if (classifyFoResponse(message) === "complete") return false;
  return /which (clinic|location|one)|riverside|pick (a |the )?(clinic|location)|these locations|following clinics/.test(
    message.toLowerCase()
  );
}
