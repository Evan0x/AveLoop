"use client";

import { useState, useEffect, useRef, Suspense } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { TimelineRow } from "@/components/Timeline";
import { AppHeader } from "@/components/AppHeader";
import { CheckCircle2, RotateCcw, Clock } from "lucide-react";
import type { Action } from "@/lib/types";
import type { FoResult } from "@/lib/fo-client";
import { SESSION_APPROVED, SESSION_CARE_DATA, SESSION_PLAN_ID } from "@/lib/session-keys";
import { updateLocalPlan } from "@/lib/local-plans";
import { SharePlanButton } from "@/components/SharePlanButton";
import { SymptomChecker } from "@/components/SymptomChecker";
import type { CareData } from "@/lib/types";

interface ActionState extends Action {
  conversationId?: string;
  foMessage?: string;
}

function ExecutePageContent() {
  const router = useRouter();
  const [actions, setActions] = useState<ActionState[]>([]);
  const [startTime] = useState(Date.now());
  const [allDone, setAllDone] = useState(false);
  const [error, setError] = useState("");
  const [careData, setCareData] = useState<CareData | null>(null);
  const startedRef = useRef(false);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(SESSION_APPROVED);
      if (!raw) {
        setError("No approved actions found. Please go back and approve your care plan.");
        return;
      }
      const data: Action[] = JSON.parse(raw);
      setActions(data.map((a) => ({ ...a, status: "processing" })));
      const careRaw = sessionStorage.getItem(SESSION_CARE_DATA);
      if (careRaw) setCareData(JSON.parse(careRaw) as CareData);
    } catch {
      setError("Failed to load actions.");
    }
  }, []);

  // Fire off Fo executions once actions are loaded
  useEffect(() => {
    if (actions.length === 0 || startedRef.current) return;
    startedRef.current = true;

    actions.forEach((action, idx) => {
      // Stagger requests so they don't all fire at once
      setTimeout(() => executeAction(action.id), idx * 600);
    });
  }, [actions.length]); // eslint-disable-line react-hooks/exhaustive-deps

  async function executeAction(actionId: string) {
    const action = actions.find((a) => a.id === actionId);
    if (!action) return;

    try {
      // Mark as processing
      setActions((prev) => prev.map((a) => (a.id === actionId ? { ...a, status: "processing" } : a)));

      const res = await fetch("/api/fo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const foReply: FoResult = await res.json();

      await handleFoReply(actionId, foReply);
    } catch {
      setActions((prev) =>
        prev.map((a) => (a.id === actionId ? { ...a, status: "failed", foMessage: "Network error" } : a))
      );
    }
  }

  async function handleFoReply(actionId: string, reply: FoResult) {
    if (reply.status === "complete") {
      setActions((prev) =>
        prev.map((a) =>
          a.id === actionId
            ? { ...a, status: "done", conversationId: reply.conversationId, foMessage: reply.response, result: reply.response }
            : a
        )
      );
      return;
    }

    if (reply.status === "failed") {
      setActions((prev) =>
        prev.map((a) => (a.id === actionId ? { ...a, status: "failed", foMessage: reply.response } : a))
      );
      return;
    }

    if (reply.status === "working") {
      // Poll for completion
      const pollRes = await fetch(`/api/fo?conversationId=${reply.conversationId}`);
      const polled: FoResult = await pollRes.json();
      await handleFoReply(actionId, polled);
      return;
    }

    if (reply.status === "needs_clarification") {
      setActions((prev) =>
        prev.map((a) =>
          a.id === actionId
            ? {
                ...a,
                status: "needs_clarification",
                conversationId: reply.conversationId,
                foMessage: reply.response,
              }
            : a
        )
      );
      return;
    }

    const looksLikeQuestion = reply.response.includes("?") || reply.response.toLowerCase().includes("which") || reply.response.toLowerCase().includes("clarif");
    if (looksLikeQuestion) {
      setActions((prev) =>
        prev.map((a) =>
          a.id === actionId
            ? {
                ...a,
                status: "needs_clarification",
                conversationId: reply.conversationId,
                foMessage: reply.response,
              }
            : a
        )
      );
    } else {
      setActions((prev) =>
        prev.map((a) =>
          a.id === actionId
            ? { ...a, status: "done", conversationId: reply.conversationId, foMessage: reply.response, result: reply.response }
            : a
        )
      );
    }
  }

  async function handleClarify(actionId: string, selectedValue: string) {
    const action = actions.find((a) => a.id === actionId);
    if (!action?.conversationId) return;

    setActions((prev) => prev.map((a) => (a.id === actionId ? { ...a, status: "processing" } : a)));

    try {
      const res = await fetch("/api/fo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversationId: action.conversationId,
          replyMessage: selectedValue,
        }),
      });
      const foReply: FoResult = await res.json();
      await handleFoReply(actionId, foReply);
    } catch {
      setActions((prev) =>
        prev.map((a) => (a.id === actionId ? { ...a, status: "failed" } : a))
      );
    }
  }

  useEffect(() => {
    if (actions.length === 0) return;
    const finished = actions.every((a) => a.status === "done" || a.status === "failed");
    if (finished) setAllDone(true);
  }, [actions]);

  useEffect(() => {
    if (!allDone) return;
    const planId = sessionStorage.getItem(SESSION_PLAN_ID);
    if (!planId) return;
    updateLocalPlan(planId, { approved_actions: actions, status: "done" });
    fetch(`/api/care-plans/${planId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ approved_actions: actions, status: "done" }),
    }).catch(() => {});
  }, [allDone, actions]);

  const doneCount = actions.filter((a) => a.status === "done").length;
  const elapsedMinutes = Math.max(1, Math.ceil((Date.now() - startTime) / 60000));

  if (error) {
    return (
      <main className="min-h-screen bg-white flex flex-col items-center justify-center px-4">
        <p className="text-red-600 text-sm mb-4 text-center">{error}</p>
        <Button variant="outline" onClick={() => router.push("/")} className="rounded-xl">
          Start over
        </Button>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gradient-to-br from-emerald-50 via-white to-teal-50 pb-10">
      <AppHeader title="Fo is on it" />
      <div className="px-4 pt-4 max-w-xl mx-auto w-full flex flex-wrap gap-2 relative z-10">
        <SymptomChecker />
        {careData && <SharePlanButton data={careData} status="executing" approved={actions} />}
      </div>
      {!allDone && (
        <div className="px-4 pt-2 max-w-xl mx-auto w-full flex items-center gap-1 text-xs text-gray-400">
          <Clock className="w-3.5 h-3.5" />
          {doneCount}/{actions.length} done
        </div>
      )}

      <div className="px-4 pt-5 max-w-xl mx-auto space-y-3">
        {actions.map((action) => (
          <TimelineRow
            key={action.id}
            action={action}
            foMessage={action.foMessage}
            onClarify={handleClarify}
          />
        ))}

        {/* Success summary */}
        {allDone && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-2xl px-5 py-5 mt-4 text-center">
            <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto mb-3" />
            <p className="text-base font-bold text-emerald-800">All done!</p>
            <p className="text-sm text-emerald-600 mt-1">
              {doneCount} action{doneCount !== 1 ? "s" : ""} completed in {elapsedMinutes} minute{elapsedMinutes !== 1 ? "s" : ""}
            </p>
            <div className="flex gap-2 mt-4">
              <Button
                variant="outline"
                onClick={() => {
                  sessionStorage.clear();
                  router.push("/");
                }}
                className="flex-1 rounded-xl border-emerald-200 text-emerald-700 hover:bg-emerald-50"
              >
                <RotateCcw className="w-4 h-4 mr-1.5" />
                Start over
              </Button>
              <Button
                variant="outline"
                className="flex-1 rounded-xl border-gray-200 text-gray-600"
                onClick={() => router.push("/history")}
              >
                View history
              </Button>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}

export default function ExecutePage() {
  return (
    <Suspense fallback={<main className="min-h-screen bg-white flex items-center justify-center"><div className="text-sm text-gray-400">Loading…</div></main>}>
      <ExecutePageContent />
    </Suspense>
  );
}
