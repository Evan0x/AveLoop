export interface Medication {
  name: string;
  dose: string;
  schedule: string;
  duration_days: number | null;
}

export interface Followup {
  reason: string;
  date: string;
  clinic: string | null;
}

export interface Action {
  id: string;
  type: "task" | "calendar" | "email" | "call";
  label: string;
  instruction: string;
  status: "ready" | "needs_input" | "processing" | "done" | "needs_clarification" | "failed";
  missing: string[];
  result?: string;
  // Fields filled in by user on review screen
  filledTimes?: string[];
  filledDate?: string;
  filledClinic?: string;
  filledPhone?: string;
  callKeywords?: string[];
}

export interface CareData {
  medications: Medication[];
  followups: Followup[];
  warnings: string[];
  care_instructions: string[];
  actions: Action[];
  needs_clarification: string[];
}

export interface ApprovedAction extends Action {
  status: "ready" | "needs_input" | "processing" | "done" | "needs_clarification" | "failed";
}

export const SUGGESTED_MEDICATION_TIMES = ["08:00", "12:00", "18:00"] as const;

export function withSuggestedTimes(action: Action): Action {
  if (!action.missing?.includes("times")) return action;
  const filledTimes = action.filledTimes?.some(Boolean)
    ? action.filledTimes
    : [...SUGGESTED_MEDICATION_TIMES];
  return {
    ...action,
    filledTimes,
    status: "needs_input",
  };
}

export const CLINIC_OPTIONS = [
  "Riverside Mental Health and Medical Clinic — Alexandria, VA",
  "Riverside Family Clinic — Vincennes, IN (~650 mi)",
  "Riverside Family Clinic — Poplar, MT (~1,750 mi)",
  "Riverside Primary Care New Town — Williamsburg, VA (~3 hrs)",
] as const;
