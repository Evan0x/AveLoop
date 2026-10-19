import type { Action, CareData } from "@/lib/types";
import { SESSION_APPROVED, SESSION_CARE_DATA, SESSION_PLAN_ID } from "@/lib/session-keys";

export const LOCAL_PLANS_KEY = "aveloop_care_plans";
const PENDING_EXECUTION_KEY = "aveloop_pending_execution";

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

export function deleteLocalPlan(id: string) {
  persist(loadLocalPlans().filter((plan) => plan.id !== id));
}

export function replaceLocalPlanId(oldId: string, newId: string) {
  if (!oldId || oldId === newId) return;
  const plans = loadLocalPlans();
  const idx = plans.findIndex((item) => item.id === oldId);
  if (idx < 0) return;
  plans[idx] = { ...plans[idx], id: newId };
  persist(plans);
}

export function savePendingExecution(payload: {
  planId: string;
  careData: CareData | null;
  actions: Action[];
}) {
  localStorage.setItem(PENDING_EXECUTION_KEY, JSON.stringify(payload));
}

export function clearPendingExecution() {
  localStorage.removeItem(PENDING_EXECUTION_KEY);
}

function parseActions(raw: string | null): Action[] | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Action[];
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : null;
  } catch {
    return null;
  }
}

export function loadExecutionInput(): {
  planId: string;
  careData: CareData | null;
  actions: Action[];
} | null {
  if (typeof window === "undefined") return null;

  const planId = sessionStorage.getItem(SESSION_PLAN_ID) ?? "";
  let careData: CareData | null = null;
  try {
    const raw = sessionStorage.getItem(SESSION_CARE_DATA);
    if (raw) careData = JSON.parse(raw) as CareData;
  } catch {
    careData = null;
  }

  const approved = parseActions(sessionStorage.getItem(SESSION_APPROVED));
  if (approved) return { planId, careData, actions: approved };

  try {
    const pendingRaw = localStorage.getItem(PENDING_EXECUTION_KEY);
    if (pendingRaw) {
      const pending = JSON.parse(pendingRaw) as {
        planId?: string;
        careData?: CareData | null;
        actions?: Action[];
      };
      const samePlan = !planId || !pending.planId || pending.planId === planId;
      if (samePlan && pending.actions?.length) {
        return {
          planId: pending.planId || planId,
          careData: pending.careData ?? careData,
          actions: pending.actions,
        };
      }
    }
  } catch {
    // The saved copy is optional.
  }

  const plan = planId ? loadLocalPlans().find((item) => item.id === planId) : undefined;
  const stored = plan?.approved_actions?.length ? plan.approved_actions : plan?.data?.actions;
  if (stored?.length) {
    return {
      planId: plan?.id ?? planId,
      careData: careData ?? plan?.data ?? null,
      actions: stored,
    };
  }

  return null;
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
