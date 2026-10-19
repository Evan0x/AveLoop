import {
  CLINIC_OPTIONS,
  SUGGESTED_MEDICATION_TIMES,
  withSuggestedTimes,
  type Action,
  type CareData,
  type Medication,
} from "@/lib/types";

function alreadyHasReminder(actions: Action[], med: Medication) {
  const name = med.name.toLowerCase();
  return actions.some(
    (action) =>
      action.type === "calendar" &&
      (action.label.toLowerCase().includes(name) || action.instruction.toLowerCase().includes(name))
  );
}

function scheduleNeedsTimes(schedule: string) {
  if (/\d{1,2}:\d{2}/.test(schedule)) return false;
  return /\b(times|daily|hours|morning|night|with food)\b/i.test(schedule);
}

const SPECIFIC_SITE = /vincennes|poplar|alexandria|williamsburg/i;

function mentionsRivera(text: string) {
  return /dr\.?\s*rivera|riverside family clinic/i.test(text);
}

function vagueWhen(text: string) {
  if (/\d{4}-\d{2}-\d{2}/.test(text)) return false;
  if (/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+\d{1,2}\b/i.test(text)) return false;
  return /week|soon|later|about|sometime|next month|tbd|flexible/i.test(text);
}

function normalizeRiveraFollowup(data: CareData, actions: Action[]) {
  const followup = (data.followups ?? []).find((item) =>
    mentionsRivera(`${item.reason} ${item.clinic ?? ""}`)
  );
  const mentioned = mentionsRivera(
    JSON.stringify({
      followups: data.followups,
      actions,
      care_instructions: data.care_instructions,
    })
  );
  if (!mentioned && !followup) return;

  let index = actions.findIndex((action) => mentionsRivera(`${action.label} ${action.instruction}`));
  if (index < 0) {
    index = actions.findIndex((action) => {
      const text = `${action.label} ${action.instruction}`;
      return (
        /follow-?up|recheck|appointment/i.test(text) &&
        !/remind|amoxicillin|ibuprofen|nasal|prescription|pharmac/i.test(text)
      );
    });
  }

  const action: Action =
    index >= 0
      ? actions[index]
      : {
          id: "followup_rivera",
          type: "calendar",
          label: "Book Dr. Rivera follow-up",
          instruction: "",
          status: "needs_input",
          missing: [],
        };

  if (index < 0) actions.push(action);
  for (let i = actions.length - 1; i >= 0; i--) {
    if (actions[i] === action) continue;
    if (mentionsRivera(`${actions[i].label} ${actions[i].instruction}`)) actions.splice(i, 1);
  }

  const source = `${followup?.reason ?? ""} ${followup?.clinic ?? ""}`;
  const actionSite = `${action.label} ${action.instruction.split("Locations:")[0].split(/ask the patient which/i)[0]}`;
  const specific =
    SPECIFIC_SITE.test(source) ||
    (!followup &&
      SPECIFIC_SITE.test(
        CLINIC_OPTIONS.reduce((haystack, option) => haystack.split(option).join(" "), actionSite)
      ));
  const whenText = `${followup?.date ?? ""} ${action.instruction}`;
  const missing = new Set((action.missing ?? []).filter((field) => field === "dates" || field === "clinic"));
  if (specific) missing.delete("clinic");
  else missing.add("clinic");
  if (vagueWhen(whenText)) missing.add("dates");

  action.type = "calendar";
  action.label = mentionsRivera(action.label) ? action.label : "Book Dr. Rivera follow-up";
  action.missing = [...missing];
  action.status = action.missing.length > 0 ? "needs_input" : "ready";
  action.instruction = specific
    ? `Create one 30-minute Google Calendar event titled "Follow-up with Dr. Rivera". Use the clinic site already named in the notes as the location. Do not email, call, or search the web.`
    : `Create one 30-minute Google Calendar event titled "Follow-up with Dr. Rivera". Discharge clinic: Riverside Family Clinic, site not specified. Put the patient's chosen location on the event. Do not email, call, or search the web.`;
}

function ensureCall(actions: Action[], id: string, label: string, instruction: string) {
  if (actions.some((action) => action.type === "call" && action.id === id)) return;
  actions.push({
    id,
    type: "call",
    label,
    instruction,
    status: "needs_input",
    missing: ["phone"],
  });
}

function ensureCalls(data: CareData, actions: Action[]) {
  const text = JSON.stringify({
    followups: data.followups,
    actions,
    care_instructions: data.care_instructions,
  });
  if (/pharmac|pick\s?up|prescription/i.test(text)) {
    ensureCall(
      actions,
      "call_pharmacy",
      "Fo calls the pharmacy",
      "Call the pharmacy. Say you are Fo calling for the patient, and ask whether the prescriptions are ready for pickup today or tomorrow."
    );
  }
  if ((data.followups ?? []).length > 0 || /follow-?up|dr\.?\s*rivera|clinic/i.test(text)) {
    ensureCall(
      actions,
      "call_clinic",
      "Fo calls the clinic",
      "Call the clinic. Say you are Fo calling for the patient to schedule the follow-up. Give the date the patient chose, and ask the person who answers for a time."
    );
  }
}

export function enrichCarePlan(data: CareData): CareData {
  const actions = [...(data.actions ?? [])];

  (data.medications ?? []).forEach((med, index) => {
    if (alreadyHasReminder(actions, med)) return;
    const needsTimes = scheduleNeedsTimes(med.schedule);
    actions.push({
      id: `med_reminder_${index + 1}`,
      type: "calendar",
      label: `Set ${med.name} reminders`,
      instruction: `Create Google Calendar reminders titled "Take ${med.name}". Dose: ${med.dose}. Schedule: ${med.schedule}.${
        med.duration_days ? ` Repeat for ${med.duration_days} days.` : ""
      } Use ${SUGGESTED_MEDICATION_TIMES.join(", ")} unless the patient changed the times.`,
      status: needsTimes ? "needs_input" : "ready",
      missing: needsTimes ? ["times"] : [],
      filledTimes: needsTimes ? [...SUGGESTED_MEDICATION_TIMES] : undefined,
    });
  });

  normalizeRiveraFollowup(data, actions);
  ensureCalls(data, actions);

  for (const action of actions) {
    if (!action.missing?.includes("clinic")) continue;
    if (action.instruction.includes("Locations:")) continue;
    action.instruction = `${action.instruction} Locations: ${CLINIC_OPTIONS.join(" | ")}.`;
  }

  return { ...data, actions: actions.map(withSuggestedTimes) };
}
