export type SymptomLevel = "emergency" | "urgent" | "monitor";

export interface SymptomTriage {
  level: SymptomLevel;
  title: string;
  advice: string;
  call911: boolean;
}

export const SYMPTOM_CHIPS = [
  "Fever above 101.5°F",
  "Stiff neck",
  "Swelling around the eyes",
  "Severe headache",
  "Symptoms worse after 5 days on antibiotics",
] as const;

export function triageSymptom(text: string): SymptomTriage {
  const t = text.toLowerCase();

  if (/stiff neck|can't bend (my )?neck|photophobia|purple rash|difficulty breathing|chest pain|unresponsive|seizure/.test(t)) {
    return {
      level: "emergency",
      title: "Go to the ER now",
      advice:
        "This can be a medical emergency (for example meningitis or a severe reaction). Call 911 or go to the nearest ER. Do not wait for a clinic callback.",
      call911: true,
    };
  }

  if (/101\.5|102|103|high fever|fever above|swelling around (the )?eyes|eye swelling|severe headache/.test(t)) {
    return {
      level: "emergency",
      title: "Seek ER or urgent care now",
      advice:
        "Your discharge instructions say to return to the ER or call the clinic for this warning sign. Go in now rather than waiting it out at home.",
      call911: false,
    };
  }

  if (/worsen|worse after|not getting better|still sick after/.test(t)) {
    return {
      level: "urgent",
      title: "Call the clinic today",
      advice:
        "If symptoms are worse after several days on antibiotics, call Riverside / your discharging clinic today and ask for a same-day callback. Keep taking the prescribed antibiotic unless a clinician tells you to stop.",
      call911: false,
    };
  }

  return {
    level: "monitor",
    title: "Watch closely and hydrate",
    advice:
      "This does not match the emergency warning list from your notes, but check again if a fever, stiff neck, eye swelling, or severe headache starts. Drink fluids and rest. Fo can still help you message the clinic.",
    call911: false,
  };
}
