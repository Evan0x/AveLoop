"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { SESSION_APPROVED, SESSION_CARE_DATA, SESSION_PLAN_ID } from "@/lib/session-keys";
import { recoverSessionPlan, type StoredPlan } from "@/lib/local-plans";
import { SharePlanButton } from "@/components/SharePlanButton";

export default function HistoryPage() {
  const router = useRouter();
  const [plans, setPlans] = useState<StoredPlan[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const local = recoverSessionPlan();
    setPlans(local);

    fetch("/api/care-plans")
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) {
          if (local.length === 0) {
            setError(body.error ?? "Could not load history.");
          }
          return;
        }
        const remote = (body.plans ?? []) as StoredPlan[];
        if (remote.length > 0) {
          const byId = new Map(local.map((plan) => [plan.id, plan]));
          for (const plan of remote) byId.set(plan.id, plan);
          setPlans(
            Array.from(byId.values()).sort(
              (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
            )
          );
        }
      })
      .catch(() => {
        if (local.length === 0) setError("Network error loading history.");
      })
      .finally(() => setLoading(false));
  }, []);

  function openPlan(plan: StoredPlan) {
    sessionStorage.setItem(SESSION_PLAN_ID, plan.id);
    sessionStorage.setItem(SESSION_CARE_DATA, JSON.stringify(plan.data));
    if (plan.status === "done" || plan.status === "executing") {
      sessionStorage.setItem(
        SESSION_APPROVED,
        JSON.stringify(plan.data.actions ?? [])
      );
      router.push("/execute");
      return;
    }
    router.push("/review");
  }

  return (
    <main className="min-h-screen bg-gradient-to-br from-emerald-50 via-white to-teal-50">
      <AppHeader title="History" />
      <div className="px-4 pt-6 max-w-xl mx-auto w-full pb-10">
        <h1 className="text-xl font-bold text-gray-900 mb-4">Your care plans</h1>
        {loading && <p className="text-sm text-gray-500">Loading…</p>}
        {error && (
          <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>
        )}
        {!loading && !error && plans.length === 0 && (
          <div className="bg-white border border-gray-100 rounded-2xl p-6 text-center">
            <p className="text-sm text-gray-500 mb-4">No saved care plans yet.</p>
            <Button onClick={() => router.push("/")} className="rounded-xl bg-[#10B981] text-white">
              Extract a plan
            </Button>
          </div>
        )}
        <div className="space-y-3">
          {plans.map((plan) => {
            const medCount = plan.data?.medications?.length ?? 0;
            const actionCount = plan.data?.actions?.length ?? 0;
            return (
              <div
                key={plan.id}
                className="bg-white border border-gray-100 rounded-2xl px-4 py-4 hover:border-emerald-200"
              >
                <button onClick={() => openPlan(plan)} className="w-full text-left">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold text-gray-900">
                      {new Date(plan.created_at).toLocaleString()}
                    </p>
                    <span className="text-xs font-medium uppercase tracking-wide text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">
                      {plan.status}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 mt-2">
                    {medCount} medication{medCount !== 1 ? "s" : ""} · {actionCount} action
                    {actionCount !== 1 ? "s" : ""}
                  </p>
                </button>
                <div className="mt-3">
                  <SharePlanButton data={plan.data} status={plan.status} notes={plan.notes} />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </main>
  );
}
