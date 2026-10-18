import type { Action, CareData } from "@/lib/types";
import { SESSION_CARE_DATA, SESSION_PLAN_ID } from "@/lib/session-keys";

export const LOCAL_PLANS_KEY = "aveloop_care_plans";

export interface StoredPlan {
  id: string;
  status: string;
  created_at: string;
  notes: string | null;
  data: CareData;
  approved_actions?: Action[] | null;
}

export function loadLocalPlans(): StoredPlan[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(LOCAL_PLANS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as StoredPlan[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function persist(plans: StoredPlan[]) {
  localStorage.setItem(LOCAL_PLANS_KEY, JSON.stringify(plans));
}

export function saveLocalPlan(plan: StoredPlan) {
  const plans = loadLocalPlans();
  const idx = plans.findIndex((item) => item.id === plan.id);
  if (idx >= 0) plans[idx] = { ...plans[idx], ...plan };
  else plans.unshift(plan);
  persist(plans);
}

export function updateLocalPlan(id: string, updates: Partial<StoredPlan>) {
  const plans = loadLocalPlans();
  const idx = plans.findIndex((item) => item.id === id);
  if (idx < 0) return;
  plans[idx] = { ...plans[idx], ...updates };
  persist(plans);
}

export function replaceLocalPlanId(oldId: string, newId: string) {
  if (!oldId || oldId === newId) return;
  const plans = loadLocalPlans();
  const idx = plans.findIndex((item) => item.id === oldId);
  if (idx < 0) return;
  plans[idx] = { ...plans[idx], id: newId };
  persist(plans);
}

export function recoverSessionPlan(): StoredPlan[] {
  const plans = loadLocalPlans();
  try {
    const raw = sessionStorage.getItem(SESSION_CARE_DATA);
    if (!raw) return plans;
    const data = JSON.parse(raw) as CareData;
    const sessionId = sessionStorage.getItem(SESSION_PLAN_ID);
    if (sessionId && plans.some((plan) => plan.id === sessionId)) return plans;
    const recovered: StoredPlan = {
      id: sessionId || crypto.randomUUID(),
      status: "extracted",
      created_at: new Date().toISOString(),
      notes: null,
      data,
    };
    saveLocalPlan(recovered);
    if (!sessionId) sessionStorage.setItem(SESSION_PLAN_ID, recovered.id);
    return loadLocalPlans();
  } catch {
    return plans;
  }
}
