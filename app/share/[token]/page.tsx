"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { SymptomChecker } from "@/components/SymptomChecker";
import type { CareData } from "@/lib/types";

interface SharePayload {
  token: string;
  createdAt: string;
  status: string;
  data: CareData;
}

export default function SharePage() {
  const params = useParams<{ token: string }>();
  const [share, setShare] = useState<SharePayload | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch(`/api/share/${params.token}`)
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) {
          setError(body.error ?? "This share link is invalid.");
          return;
        }
        setShare(body.share);
      })
      .catch(() => setError("Could not load this care plan."));
  }, [params.token]);

  if (error) {
    return (
      <main className="min-h-screen bg-white flex items-center justify-center px-4">
        <p className="text-sm text-red-600">{error}</p>
      </main>
    );
  }

  if (!share) {
    return (
      <main className="min-h-screen bg-white flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-[#10B981] border-t-transparent" />
      </main>
    );
  }

  const { data } = share;

  return (
    <main className="min-h-screen bg-gradient-to-br from-emerald-50 via-white to-teal-50 pb-10">
      <AppHeader title="Shared care plan" />
      <div className="px-4 pt-5 max-w-xl mx-auto space-y-4">
        <div className="bg-teal-50 border border-teal-200 rounded-2xl px-4 py-3">
          <p className="text-sm font-semibold text-teal-900">Caregiver view</p>
          <p className="text-xs text-teal-700 mt-1">
            Read-only plan from AveLoop. You can help watch warning signs; you cannot approve Fo actions from this link.
          </p>
        </div>

        {data.warnings.length > 0 && (
          <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3">
            <p className="text-xs font-semibold text-red-700 mb-1">When to seek help</p>
            <ul className="space-y-1">
              {data.warnings.map((warning) => (
                <li key={warning} className="text-xs text-red-600">
                  • {warning}
                </li>
              ))}
            </ul>
            <div className="mt-3">
              <SymptomChecker />
            </div>
          </div>
        )}

        {data.medications.length > 0 && (
          <section className="bg-white border border-gray-100 rounded-2xl px-4 py-3">
            <h2 className="text-sm font-semibold text-gray-700 mb-2">Medications</h2>
            <div className="space-y-2">
              {data.medications.map((med) => (
                <div key={med.name}>
                  <p className="text-sm font-medium text-gray-900">
                    {med.name} — {med.dose}
                  </p>
                  <p className="text-xs text-gray-500">{med.schedule}</p>
                </div>
              ))}
            </div>
          </section>
        )}

        <section className="bg-white border border-gray-100 rounded-2xl px-4 py-3">
          <h2 className="text-sm font-semibold text-gray-700 mb-2">Next steps</h2>
          <div className="space-y-2">
            {data.actions.map((action) => (
              <div key={action.id} className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-gray-900">{action.label}</p>
                  <p className="text-xs text-gray-500">{action.instruction}</p>
                </div>
                <span className="text-[10px] uppercase tracking-wide text-gray-500 bg-gray-50 px-2 py-0.5 rounded-full shrink-0">
                  {action.status}
                </span>
              </div>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
