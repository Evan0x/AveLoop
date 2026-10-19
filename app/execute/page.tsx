"use client";

import { useState, useEffect, useRef, Suspense } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { TimelineRow } from "@/components/Timeline";
import { AppHeader } from "@/components/AppHeader";
import { CheckCircle2, RotateCcw, Clock, Volume2 } from "lucide-react";
import { clearPendingExecution, loadExecutionInput, updateLocalPlan } from "@/lib/local-plans";
import { listenForReply, speak, stopSpeaking } from "@/lib/fo-voice";
import { callScript, clinicFromReply } from "@/lib/fo-execute";
import type { FoResult } from "@/lib/fo-client";
import { SESSION_CARE_DATA, SESSION_PLAN_ID } from "@/lib/session-keys";
import { SharePlanButton } from "@/components/SharePlanButton";
import { DeletePlanButton } from "@/components/DeletePlanButton";
import { SymptomChecker } from "@/components/SymptomChecker";
import type { Action, CareData } from "@/lib/types";

interface ActionState extends Action {
  conversationId?: string;
  foMessage?: string;
}

function echoesScript(heard: string, script: string) {
  const clean = (value: string) => value.toLowerCase().replace(/[^a-z0-9 ]/g, "").trim();
  const reply = clean(heard);
  const prompt = clean(script);
  if (reply.length < 12) return false;
  return prompt.includes(reply) || reply.includes(prompt.slice(0, 48));
}

function ExecutePageContent() {
  const router = useRouter();
  const [actions, setActions] = useState<ActionState[]>([]);
  const [startTime] = useState(Date.now());
  const [allDone, setAllDone] = useState(false);
  const [error, setError] = useState("");
  const [careData, setCareData] = useState<CareData | null>(null);
  const [planId, setPlanId] = useState("");
  const [hearing, setHearing] = useState(false);
  const [hearError, setHearError] = useState("");
  const startedRef = useRef(false);
  const callsStarted = useRef(false);
  const hearRun = useRef(0);

  useEffect(() => {
    try {
      const loaded = loadExecutionInput();
      if (!loaded) {
        setError("No approved actions found. Please go back and approve your care plan.");
        return;
      }
      if (loaded.planId) sessionStorage.setItem(SESSION_PLAN_ID, loaded.planId);
      if (loaded.careData) sessionStorage.setItem(SESSION_CARE_DATA, JSON.stringify(loaded.careData));
      setActions(loaded.actions.map((action) => ({ ...action, status: "processing" })));
      setCareData(loaded.careData);
      setPlanId(loaded.planId);
    } catch {
      setError("Failed to load actions.");
    }
  }, []);

  // Fire off Fo executions once actions are loaded
  useEffect(() => {
    if (actions.length === 0 || startedRef.current) return;
    startedRef.current = true;

    actions
      .filter((action) => action.type !== "call")
      .forEach((action, idx) => {
        setTimeout(() => executeAction(action.id), idx * 600);
      });
  }, [actions.length]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!startedRef.current || callsStarted.current || actions.length === 0) return;
    const othersPending = actions.some(
      (action) => action.type !== "call" && (action.status === "processing" || action.status === "ready")
    );
    if (othersPending) return;
    const calls = actions.filter((action) => action.type === "call");
    if (calls.length === 0) return;
    callsStarted.current = true;
    void (async () => {
      for (const action of calls) {
        await placeCall(action);
      }
    })();
  }, [actions]); // eslint-disable-line react-hooks/exhaustive-deps

  async function placeCall(action: ActionState) {
    const phone = action.filledPhone?.replace(/[^\d+]/g, "") ?? "";
    if (!phone) {
      setActions((prev) =>
        prev.map((item) =>
          item.id === action.id
            ? { ...item, status: "done", foMessage: "No phone number, so Fo did not call.", callKeywords: [] }
            : item
        )
      );
      return;
    }

    const script = callScript(action);
    const dialKey = `aveloop_dialed_${action.id}_${phone}`;
    if (sessionStorage.getItem(dialKey)) {
      setActions((prev) =>
        prev.map((item) =>
          item.id === action.id
            ? {
                ...item,
                status: "done",
                foMessage: "The Mac could not place this call. Check Calls from iPhone, then use a number that is not this iPhone.",
                callKeywords: [],
              }
            : item
        )
      );
      return;
    }
    sessionStorage.setItem(dialKey, "1");
    setActions((prev) =>
      prev.map((item) =>
        item.id === action.id
          ? { ...item, status: "processing", foMessage: `Calling ${action.filledPhone}. Leave this page open and use speakerphone so Fo can hear the reply.` }
          : item
      )
    );
    const link = document.createElement("a");
    link.href = `tel:${phone}`;
    link.rel = "noopener";
    document.body.appendChild(link);
    link.click();
    link.remove();
    await speak(script);
    const heard = await listenForReply();
    const transcript = echoesScript(heard, script) ? "" : heard;
    if (!transcript) {
      setActions((prev) =>
        prev.map((item) =>
          item.id === action.id
            ? { ...item, status: "done", foMessage: "Fo called, but did not catch a reply.", callKeywords: [] }
            : item
        )
      );
      return;
    }

    let keywords: string[] = [];
    try {
      const res = await fetch("/api/call-keywords", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript, purpose: action.label }),
      });
      const data = (await res.json()) as { keywords?: string[] };
      keywords = Array.isArray(data.keywords) ? data.keywords : [];
    } catch {
      keywords = [];
    }
    setActions((prev) =>
      prev.map((item) =>
        item.id === action.id
          ? { ...item, status: "done", foMessage: transcript, result: transcript, callKeywords: keywords }
          : item
      )
    );
  }

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

    const spokenClinic = clinicFromReply(selectedValue);
    const filledClinic = spokenClinic ?? action.filledClinic;
    const nextAction = { ...action, filledClinic };

    setActions((prev) =>
      prev.map((a) => (a.id === actionId ? { ...a, status: "processing", filledClinic } : a))
    );

    try {
      const res = await fetch("/api/fo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversationId: action.conversationId,
          replyMessage: spokenClinic ?? selectedValue,
          action: nextAction,
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

  async function hearSummary() {
    if (hearing) {
      hearRun.current += 1;
      stopSpeaking();
      setHearing(false);
      setHearError("");
      return;
    }
    const run = ++hearRun.current;
    const spoken = actions
      .map((action) => {
        const message = action.foMessage?.trim();
        if (!message) return action.label;
        const sentence = message.split(/(?<=[.!?])\s/)[0] ?? message;
        return `${action.label}. ${sentence}`;
      })
      .filter(Boolean)
      .join(" ");
    setHearError("");
    setHearing(true);
    const played = await speak((spoken || `${doneCount} actions are done.`).slice(0, 900));
    if (run !== hearRun.current) return;
    setHearing(false);
    if (!played) setHearError("Could not play the summary. Click Hear summary again.");
  }

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
        {planId && careData && (
          <DeletePlanButton
            plan={{
              id: planId,
              status: allDone ? "done" : "executing",
              created_at: new Date().toISOString(),
              notes: null,
              data: careData,
              approved_actions: actions,
            }}
            onDeleted={() => router.push("/history")}
          />
        )}
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
            <Button
              type="button"
              onClick={hearSummary}
              className="w-full mt-4 rounded-xl bg-[#1B9A64] text-white hover:bg-[#157a4f]"
            >
              <Volume2 className="w-4 h-4 mr-1.5" />
              {hearing ? "Preparing voice…" : "Hear summary"}
            </Button>
            {hearError && <p className="text-xs text-red-600 mt-2">{hearError}</p>}
            <div className="flex gap-2 mt-4">
              <Button
                variant="outline"
                onClick={() => {
                  sessionStorage.clear();
                  clearPendingExecution();
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
