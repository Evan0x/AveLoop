import { deleteLocalPlan, type StoredPlan } from "@/lib/local-plans";
import { SESSION_APPROVED, SESSION_CARE_DATA, SESSION_PLAN_ID } from "@/lib/session-keys";

export async function deleteCarePlan(plan: StoredPlan) {
  const res = await fetch(`/api/care-plans/${plan.id}`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      status: plan.status,
      data: plan.data,
      approved_actions: plan.approved_actions ?? plan.data?.actions ?? [],
    }),
  });
  const body = (await res.json()) as { error?: string; response?: string };
  if (!res.ok) {
    throw new Error(body.error ?? "Could not delete this care plan.");
  }

  deleteLocalPlan(plan.id);
  if (sessionStorage.getItem(SESSION_PLAN_ID) === plan.id) {
    sessionStorage.removeItem(SESSION_PLAN_ID);
    sessionStorage.removeItem(SESSION_CARE_DATA);
    sessionStorage.removeItem(SESSION_APPROVED);
  }
  return body.response ?? "";
}
