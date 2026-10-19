"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Fraunces } from "next/font/google";
import { useAuth } from "@clerk/nextjs";
import { AppHeader } from "@/components/AppHeader";
import { Loader2, FileText, Sparkles, Camera, X, Check, Clock, Shield } from "lucide-react";
import type { CareData } from "@/lib/types";
import { SESSION_CARE_DATA, SESSION_PLAN_ID } from "@/lib/session-keys";
import { replaceLocalPlanId, saveLocalPlan } from "@/lib/local-plans";

const display = Fraunces({
  subsets: ["latin"],
  style: ["normal", "italic"],
});

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
    <main className="relative min-h-screen overflow-hidden bg-[#f4fbf7] text-[#1a2420]">
      <div className="pointer-events-none absolute inset-0" aria-hidden>
        <div className="absolute -left-24 top-16 h-80 w-80 rounded-full bg-[#dff5ea] blur-3xl" />
        <div className="absolute right-0 top-0 h-96 w-96 rounded-full bg-[#e7f7ef] blur-3xl" />
        <div className="absolute bottom-0 left-1/3 h-72 w-72 rounded-full bg-[#e3f6ec] blur-3xl" />
        <svg className="absolute left-[8%] top-[22%] h-40 w-40 text-[#cfe8db]" viewBox="0 0 160 160" fill="none">
          <circle cx="80" cy="80" r="70" stroke="currentColor" strokeDasharray="4 8" />
        </svg>
        <svg className="absolute right-[6%] top-[18%] h-56 w-56 text-[#d5eee2]" viewBox="0 0 220 220" fill="none">
          <circle cx="110" cy="110" r="96" stroke="currentColor" strokeDasharray="3 10" />
        </svg>
        <span className="absolute left-[18%] top-[38%] text-2xl font-light text-[#b7dcc8]">+</span>
        <span className="absolute right-[14%] bottom-[18%] text-3xl font-light text-[#c5e4d4]">+</span>
      </div>

      <AppHeader />

      <div className="relative mx-auto w-full max-w-6xl px-4 pb-16 pt-8 sm:pt-12">
        <div className="mx-auto max-w-5xl text-center">
          <p className="mb-4 flex items-center justify-center gap-3 text-[11px] font-semibold uppercase tracking-[0.22em] text-[#3d9a74]">
            <span className="h-px w-8 bg-[#7dbea2]" />
            Your recovery, made clearer
          </p>
          <h1 className={`${display.className} text-[2.05rem] font-semibold leading-[1.12] tracking-tight text-[#1b1f1c] sm:whitespace-nowrap sm:text-[clamp(2.4rem,3.5vw,3.15rem)] sm:leading-[1.05]`}>
            Turn discharge notes into{" "}
            <span className="italic text-[#1B9A64]">a care plan</span>
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-sm leading-relaxed text-gray-500 sm:text-[15px]">
            Paste notes or snap a photo of the discharge sheet. We&apos;ll extract medications, follow-ups, and next steps—then Fo helps get them done.
          </p>
        </div>

        <div className="relative mx-auto mt-8 max-w-2xl">
          <aside
            style={{ transform: "translateX(calc(-100% - 12px)) rotate(-7deg)" }}
            className="absolute left-0 top-[42%] z-10 hidden items-center gap-2 rounded-2xl border border-[#e8f2ec] bg-white py-2 pl-2 pr-3.5 shadow-[0_14px_34px_-20px_rgba(24,80,50,0.45)] md:flex"
          >
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#e7f6ee] text-[#1B9A64]">
              <Check className="h-3.5 w-3.5" strokeWidth={2.75} />
            </span>
            <span>
              <span className="block text-[13px] font-semibold leading-tight text-[#1c2430]">Clear next steps</span>
              <span className="block text-[11px] leading-tight text-gray-400">Organized in seconds</span>
            </span>
          </aside>

          <aside
            style={{ transform: "translateX(calc(100% + 12px)) rotate(7deg)" }}
            className="absolute right-0 bottom-[18%] z-10 hidden items-center gap-2 rounded-2xl border border-[#e8f2ec] bg-white py-2 pl-2 pr-3.5 shadow-[0_14px_34px_-20px_rgba(24,80,50,0.45)] md:flex"
          >
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#e7f6ee] text-[#1B9A64]">
              <Clock className="h-3.5 w-3.5" />
            </span>
            <span>
              <span className="block text-[13px] font-semibold leading-tight text-[#1c2430]">Stay on track</span>
              <span className="block text-[11px] leading-tight text-gray-400">Follow-ups made simple</span>
            </span>
          </aside>

          <div className="rounded-[28px] border border-[#edf3ef] bg-white px-5 py-5 shadow-[0_30px_80px_-48px_rgba(16,70,45,0.55)] sm:px-7 sm:py-6">
            <div className="mb-4 flex items-start gap-3">
              <span className="mt-0.5 flex h-9 w-9 items-center justify-center rounded-xl bg-[#eef8f3] text-[#1B9A64]">
                <FileText className="h-4 w-4" />
              </span>
              <span>
                <span className="block text-base font-semibold text-[#1a2420]">Discharge notes</span>
                <span className="block text-sm text-gray-400">Add the instructions you received from your care team.</span>
              </span>
            </div>

            <textarea
              className="h-52 w-full resize-none rounded-2xl border border-[#e7f0eb] bg-[#f6faf8] px-4 py-4 text-sm leading-relaxed text-gray-700 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#1B9A64]/20"
              placeholder={"Paste your discharge summary here…\n\nInclude medications, follow-up appointments, and any instructions from your doctor."}
              value={notes}
              onChange={(e) => {
                setNotes(e.target.value);
                if (error) setError("");
              }}
            />

            <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-2">
                <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-600 hover:bg-gray-50">
                  <Camera className="h-4 w-4 text-gray-500" />
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
                  <span className="flex min-w-0 items-center gap-1 text-xs text-gray-500">
                    <span className="max-w-[140px] truncate">{file.name}</span>
                    <button
                      type="button"
                      onClick={() => setFile(null)}
                      className="text-gray-400 hover:text-gray-700"
                      aria-label="Remove file"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </span>
                )}
              </div>
              <p className="inline-flex items-center gap-1.5 text-xs text-gray-400">
                <Shield className="h-3.5 w-3.5 text-[#1B9A64]" />
                Your health details stay private
              </p>
            </div>

            {error && (
              <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>
            )}

            <div className="mt-4 grid gap-3 sm:grid-cols-[1.35fr_0.9fr]">
              <button
                type="button"
                onClick={handleExtract}
                disabled={loading}
                className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-[#1B9A64] text-sm font-semibold text-white transition hover:bg-[#178756] disabled:opacity-60"
              >
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Extracting your care plan…
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4" />
                    Extract my care plan
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={() => setNotes(SAMPLE_NOTE)}
                disabled={loading}
                className="inline-flex h-12 items-center justify-center rounded-xl border border-gray-200 bg-white text-sm font-medium text-gray-600 transition hover:bg-gray-50 disabled:opacity-60"
              >
                Use sample notes
              </button>
            </div>
          </div>
        </div>

        <p className="mt-6 flex items-center justify-center gap-1.5 text-center text-xs text-gray-400">
          <Shield className="h-3.5 w-3.5 text-[#8fb9a6]" />
          Signed-in plans are saved securely so you can reopen them later.
        </p>
      </div>
    </main>
  );
}
