"use client";

import { useState, type MouseEvent } from "react";
import { Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { deleteCarePlan } from "@/lib/delete-plan";
import type { StoredPlan } from "@/lib/local-plans";

export function DeletePlanButton({
  plan,
  onDeleted,
}: {
  plan: StoredPlan;
  onDeleted?: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function remove(event: MouseEvent<HTMLButtonElement>) {
    event.stopPropagation();
    event.preventDefault();
    const confirmed = window.confirm(
      "Delete this care plan? This also removes its calendar events, appointments, and bookings."
    );
    if (!confirmed) return;

    setBusy(true);
    setError("");
    try {
      const warning = await deleteCarePlan(plan);
      onDeleted?.();
      if (warning) window.alert(warning);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete this care plan.");
      setBusy(false);
    }
  }

  return (
    <div>
      <Button
        type="button"
        variant="destructive"
        disabled={busy}
        onClick={remove}
        className="rounded-xl"
      >
        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
        {busy ? "Deleting plan…" : "Delete plan"}
      </Button>
      {error && <p className="text-xs text-red-600 mt-2">{error}</p>}
    </div>
  );
}
