"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ActionCard } from "@/components/ActionCard";
import { AppHeader } from "@/components/AppHeader";
import { Send } from "lucide-react";
import type { Action, CareData } from "@/lib/types";
import { SESSION_APPROVED, SESSION_CARE_DATA, SESSION_PLAN_ID } from "@/lib/session-keys";
import { updateLocalPlan } from "@/lib/local-plans";
import { SharePlanButton } from "@/components/SharePlanButton";
import { SymptomChecker } from "@/components/SymptomChecker";

export default function ReviewPage() {
  const router = useRouter();
  const [careData, setCareData] = useState<CareData | null>(null);
  const [actions, setActions] = useState<Action[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(SESSION_CARE_DATA);
      if (!raw) {
        setError("No care data found. Please go back and extract your notes first.");
        return;
      }
      const data: CareData = JSON.parse(raw);
      setCareData(data);
      setActions(data.actions ?? []);
    } catch {
      setError("Failed to load care data. Please try again.");
    }
  }, []);

  function handleUpdate(id: string, updates: Partial<Action>) {
    setActions((prev) =>
      prev.map((a) => (a.id === id ? { ...a, ...updates } : a))
    );
  }

  function isActionFilled(action: Action): boolean {
    if (action.status === "ready") return true;
    for (const field of action.missing) {
      if (field === "clinic") continue;
      if (field === "times" && (!action.filledTimes || action.filledTimes.some((t) => !t))) return false;
      if (field === "dates" && !action.filledDate) return false;
    }
    return true;
  }

  const readyActions = actions.filter((a) => a.status === "ready");
  const needsInputActions = actions.filter((a) => a.status === "needs_input");
  const filledCount = actions.filter(isActionFilled).length;
  const allFilled = filledCount === actions.length;

  async function handleApprove() {
    if (!careData) return;
    const approved = actions.map((a) => ({
      ...a,
      status: "processing" as Action["status"],
    }));
    sessionStorage.setItem(SESSION_APPROVED, JSON.stringify(approved));
    const planId = sessionStorage.getItem(SESSION_PLAN_ID);
    if (planId) {
      updateLocalPlan(planId, {
        data: { ...careData, actions },
        approved_actions: approved,
        status: "executing",
      });
      try {
        await fetch(`/api/care-plans/${planId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            data: { ...careData, actions },
            approved_actions: approved,
            status: "executing",
          }),
        });
      } catch {
        // Continue even if persistence fails.
      }
    }
    router.push("/execute");
  }

  if (error) {
    return (
      <main className="min-h-screen bg-white flex flex-col items-center justify-center px-4">
        <p className="text-red-600 text-sm mb-4">{error}</p>
        <Button variant="outline" onClick={() => router.push("/")} className="rounded-xl">
          Start over
        </Button>
      </main>
    );
  }

  if (!careData) {
    return (
      <main className="min-h-screen bg-white flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-[#10B981] border-t-transparent" />
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gradient-to-br from-emerald-50 via-white to-teal-50 pb-28">
      <AppHeader title="Review your care plan" />

      <div className="px-4 pt-5 max-w-xl mx-auto space-y-6">
        {/* Summary pills */}
        <div className="flex justify-end">
          <SharePlanButton data={{ ...careData, actions }} status="extracted" />
        </div>

        {careData.warnings.length > 0 && (
          <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3">
            <p className="text-xs font-semibold text-red-700 mb-1">⚠ When to seek help</p>
            <ul className="space-y-1">
              {careData.warnings.map((w, i) => (
                <li key={i} className="text-xs text-red-600">• {w}</li>
              ))}
            </ul>
            <div className="mt-3">
              <SymptomChecker />
            </div>
          </div>
        )}

        {/* Ready actions */}
        {readyActions.length > 0 && (
          <section>
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
              Ready to execute ({readyActions.length})
            </h2>
            <div className="space-y-3">
              {readyActions.map((action) => (
                <ActionCard key={action.id} action={action} onUpdate={handleUpdate} />
              ))}
            </div>
          </section>
        )}

        {/* Needs input actions */}
        {needsInputActions.length > 0 && (
          <section>
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
              Need your input ({needsInputActions.length})
            </h2>
            <div className="space-y-3">
              {needsInputActions.map((action) => (
                <ActionCard key={action.id} action={action} onUpdate={handleUpdate} />
              ))}
            </div>
          </section>
        )}

        {/* Medications summary */}
        {careData.medications.length > 0 && (
          <section>
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
              Medications
            </h2>
            <div className="bg-teal-50 border border-teal-200 rounded-xl px-4 py-3 space-y-2">
              {careData.medications.map((med, i) => (
                <div key={i} className="text-sm">
                  <span className="font-medium text-teal-800">{med.name}</span>
                  <span className="text-teal-600"> — {med.dose}</span>
                  <p className="text-xs text-teal-500 mt-0.5">{med.schedule}</p>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>

      {/* Sticky bottom bar */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 px-4 py-3 z-20">
        <div className="max-w-xl mx-auto">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-gray-500">
              <span className="text-emerald-600 font-semibold">{filledCount}/{actions.length} ready</span>
              {actions.length - filledCount > 0 && (
                <> · <span className="text-orange-500 font-semibold">{actions.length - filledCount} need input</span></>
              )}
            </span>
          </div>
          <Button
            onClick={handleApprove}
            disabled={!allFilled}
            className="w-full bg-[#10B981] hover:bg-[#059669] disabled:opacity-40 text-white h-11 rounded-xl font-semibold text-sm"
          >
            <Send className="w-4 h-4 mr-2" />
            Approve &amp; Send to Fo
          </Button>
        </div>
      </div>
    </main>
  );
}
