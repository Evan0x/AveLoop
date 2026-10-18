import { CLINIC_OPTIONS, type Action, type CareData, type Medication } from "@/lib/types";

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
      } Use any medication times the patient provided. If Google Calendar needs authorization, ask the user to connect it and wait.`,
      status: needsTimes ? "needs_input" : "ready",
      missing: needsTimes ? ["times"] : [],
    });
  });

  for (const action of actions) {
    if (!action.missing?.includes("clinic")) continue;
    if (action.instruction.includes("Riverside Family Clinic — Vincennes")) continue;
    action.instruction = `${action.instruction} The clinic name is ambiguous. Ask the patient which location to book: ${CLINIC_OPTIONS.join(" | ")}.`;
  }

  return { ...data, actions };
}
