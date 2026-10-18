"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@clerk/nextjs";
import { Button } from "@/components/ui/button";
import { AppHeader } from "@/components/AppHeader";
import { Loader2, FileText, Sparkles, Camera, X } from "lucide-react";
import type { CareData } from "@/lib/types";
import { SESSION_CARE_DATA, SESSION_PLAN_ID } from "@/lib/session-keys";
import { replaceLocalPlanId, saveLocalPlan } from "@/lib/local-plans";

const SAMPLE_NOTE = `DISCHARGE SUMMARY
Patient: Alex Chen    Discharged: October 17, 2026
Diagnosis: Acute sinusitis, mild dehydration

Medications:
- Amoxicillin 500 mg, take 1 capsule 3 times a day with food for 10 days.
- Ibuprofen 400 mg every 6–8 hours as needed for pain. Max 3 doses/day.
- Nasal saline rinse morning and night until symptoms resolve.

Follow-up:
- Recheck with Dr. Rivera at Riverside Family Clinic in about 2 weeks.
- Blood work (basic panel) sometime next week, fasting required.

Instructions:
- Drink at least 2 L of fluids daily. Rest for 3 days.
- Return to the ER or call the clinic if: fever above 101.5°F, severe headache or stiff neck, swelling around the eyes, or symptoms worsen after 5 days on antibiotics.
- Prescriptions sent to Pharmacy on Main St. Pick up today or tomorrow.`;

export default function UploadPage() {
  const router = useRouter();
  const { isSignedIn } = useAuth();
  const [notes, setNotes] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleExtract() {
    if (!isSignedIn) {
      router.push("/sign-in");
      return;
    }
    if (!notes.trim() && !file) {
      setError("Paste notes or upload a discharge photo/PDF.");
      return;
    }
    setLoading(true);
    setError("");

    try {
      let res: Response;
      if (file) {
        const form = new FormData();
        form.append("notes", notes);
        form.append("file", file);
        res = await fetch("/api/extract", { method: "POST", body: form });
      } else {
        res = await fetch("/api/extract", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ notes }),
        });
      }

      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "Something went wrong. Please try again.");
        return;
      }

      const careData: CareData = data;
      sessionStorage.setItem(SESSION_CARE_DATA, JSON.stringify(careData));

      const localId = crypto.randomUUID();
      sessionStorage.setItem(SESSION_PLAN_ID, localId);
      saveLocalPlan({
        id: localId,
        status: "extracted",
        created_at: new Date().toISOString(),
        notes,
        data: careData,
      });

      try {
        const saveRes = await fetch("/api/care-plans", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ notes, data: careData }),
        });
        const saved = await saveRes.json();
        if (saved.id) {
          replaceLocalPlanId(localId, saved.id);
          sessionStorage.setItem(SESSION_PLAN_ID, saved.id);
        }
      } catch {
        // Keep the in-session flow even if Supabase is not configured yet.
      }

      router.push("/review");
    } catch {
      setError("Network error. Please check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-gradient-to-br from-emerald-50 via-white to-teal-50 flex flex-col">
      <AppHeader />

      {/* Hero */}
      <div className="px-4 pt-6 pb-4 max-w-xl mx-auto w-full">
        <h1 className="text-2xl font-bold text-gray-900 leading-tight">
          Turn discharge notes into
          <span className="text-[#10B981]"> a care plan</span>
        </h1>
        <p className="mt-2 text-gray-500 text-sm">
          Paste notes or snap a photo of the discharge sheet. We&apos;ll extract medications, follow-ups, and next steps—then Fo helps get them done.
        </p>
      </div>

      {/* Main card */}
      <div className="flex-1 px-4 max-w-xl mx-auto w-full">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
          <div className="flex items-center gap-2 mb-3">
            <FileText className="w-4 h-4 text-gray-400" />
            <span className="text-sm font-medium text-gray-600">Discharge notes</span>
          </div>

          <textarea
            className="w-full h-48 text-sm text-gray-700 placeholder-gray-300 resize-none focus:outline-none leading-relaxed"
            placeholder="Paste your discharge summary here…&#10;&#10;Include medications, follow-up appointments, and any instructions from your doctor."
            value={notes}
            onChange={(e) => {
              setNotes(e.target.value);
              if (error) setError("");
            }}
          />

          <div className="mt-3 flex items-center gap-2">
            <label className="inline-flex items-center gap-1.5 text-sm text-gray-600 border border-gray-200 rounded-xl px-3 py-2 cursor-pointer hover:bg-gray-50">
              <Camera className="w-4 h-4" />
              Photo or PDF
              <input
                type="file"
                accept="image/*,application/pdf"
                capture="environment"
                className="hidden"
                onChange={(e) => {
                  const next = e.target.files?.[0] ?? null;
                  setFile(next);
                  if (error) setError("");
                }}
              />
            </label>
            {file && (
              <span className="text-xs text-gray-500 flex items-center gap-1 min-w-0">
                <span className="truncate max-w-[160px]">{file.name}</span>
                <button
                  type="button"
                  onClick={() => setFile(null)}
                  className="text-gray-400 hover:text-gray-700"
                  aria-label="Remove file"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </span>
            )}
          </div>

          {error && (
            <p className="mt-2 text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>
          )}

          <div className="mt-4 flex flex-col gap-2">
            <Button
              onClick={handleExtract}
              disabled={loading}
              className="w-full bg-[#10B981] hover:bg-[#059669] text-white h-11 rounded-xl font-semibold text-sm"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Extracting your care plan…
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 mr-2" />
                  Extract my care plan
                </>
              )}
            </Button>

            <Button
              variant="outline"
              onClick={() => setNotes(SAMPLE_NOTE)}
              disabled={loading}
              className="w-full h-9 rounded-xl text-sm text-gray-600 border-gray-200"
            >
              Use sample notes
            </Button>
          </div>
        </div>

        <p className="text-center text-xs text-gray-400 mt-4 pb-8">
          Signed-in plans are saved to your account so you can reopen them later.
        </p>
      </div>
    </main>
  );
}
