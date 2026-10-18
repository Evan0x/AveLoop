"use client";

import { useState } from "react";
import { Share2, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Action, CareData } from "@/lib/types";

export function SharePlanButton({
  data,
  status,
  notes,
  approved,
}: {
  data: CareData;
  status?: string;
  notes?: string | null;
  approved?: Action[] | null;
}) {
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);

  async function share() {
    setBusy(true);
    try {
      const res = await fetch("/api/share", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          data,
          status,
          notes,
          approved_actions: approved ?? data.actions,
        }),
      });
      const body = await res.json();
      if (!res.ok || !body.token) return;
      const url = `${window.location.origin}/share/${body.token}`;
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button
      type="button"
      variant="outline"
      onClick={share}
      disabled={busy}
      className="rounded-xl border-gray-200 text-gray-700 h-9 text-sm"
    >
      {copied ? <Check className="w-4 h-4 mr-1.5 text-emerald-600" /> : <Share2 className="w-4 h-4 mr-1.5" />}
      {copied ? "Link copied" : "Share with caregiver"}
    </Button>
  );
}
