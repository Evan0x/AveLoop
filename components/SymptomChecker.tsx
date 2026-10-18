"use client";

import { useState } from "react";
import { AlertTriangle, Loader2, Phone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SYMPTOM_CHIPS, type SymptomTriage } from "@/lib/symptoms";

interface SymptomResult extends SymptomTriage {
  foResponse?: string | null;
}

export function SymptomChecker() {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<SymptomResult | null>(null);

  async function submit(value: string) {
    const symptom = value.trim();
    if (!symptom) return;
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch("/api/symptoms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: symptom }),
      });
      const body = await res.json();
      if (res.ok) setResult(body);
    } finally {
      setLoading(false);
    }
  }

  const tone =
    result?.level === "emergency"
      ? "bg-red-50 border-red-200 text-red-800"
      : result?.level === "urgent"
        ? "bg-orange-50 border-orange-200 text-orange-800"
        : "bg-emerald-50 border-emerald-200 text-emerald-800";

  return (
    <>
      <Button
        type="button"
        variant="outline"
        onClick={() => setOpen(true)}
        className="rounded-xl border-red-200 text-red-700 hover:bg-red-50 h-9 text-sm"
      >
        <AlertTriangle className="w-4 h-4 mr-1.5" />
        I&apos;m having a symptom
      </Button>

      {open && (
        <div className="fixed inset-0 z-40 bg-black/40 flex items-end sm:items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-4 shadow-xl">
            <p className="text-sm font-semibold text-gray-900">Red-flag check</p>
            <p className="text-xs text-gray-500 mt-1">
              Tell Fo what you&apos;re feeling. Emergency signs skip the agent and tell you to go in now.
            </p>
            <div className="flex flex-wrap gap-1.5 mt-3">
              {SYMPTOM_CHIPS.map((chip) => (
                <button
                  key={chip}
                  type="button"
                  onClick={() => {
                    setText(chip);
                    void submit(chip);
                  }}
                  className="text-xs px-2.5 py-1 rounded-full border border-red-100 text-red-700 hover:bg-red-50"
                >
                  {chip}
                </button>
              ))}
            </div>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={3}
              placeholder="e.g. fever 102 and a stiff neck"
              className="mt-3 w-full text-sm border border-gray-200 rounded-xl px-3 py-2 focus:outline-none"
            />
            {result && (
              <div className={`mt-3 rounded-xl border px-3 py-3 ${tone}`}>
                <p className="text-sm font-semibold">{result.title}</p>
                <p className="text-xs mt-1 leading-relaxed">{result.advice}</p>
                {result.foResponse && (
                  <p className="text-xs mt-2 opacity-90">Fo: {result.foResponse}</p>
                )}
                {result.call911 && (
                  <a
                    href="tel:911"
                    className="mt-3 inline-flex items-center text-sm font-semibold text-red-700"
                  >
                    <Phone className="w-4 h-4 mr-1.5" />
                    Call 911
                  </a>
                )}
              </div>
            )}
            <div className="flex gap-2 mt-4">
              <Button
                variant="outline"
                className="flex-1 rounded-xl"
                onClick={() => {
                  setOpen(false);
                  setResult(null);
                }}
              >
                Close
              </Button>
              <Button
                className="flex-1 rounded-xl bg-red-600 hover:bg-red-700 text-white"
                disabled={loading || !text.trim()}
                onClick={() => void submit(text)}
              >
                {loading ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : null}
                Check with Fo
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
