"use client";

import { useEffect, useRef, useState } from "react";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "./StatusBadge";
import { clinicFromReply, shouldOfferClinicChoices } from "@/lib/fo-execute";
import {
  enableVoiceFollowUp,
  listen,
  speak,
  stopListening,
  stopSpeaking,
  voiceFollowUpEnabled,
  voiceInputSupported,
} from "@/lib/fo-voice";
import { CLINIC_OPTIONS, type Action } from "@/lib/types";
import {
  CheckCircle,
  XCircle,
  Loader2,
  AlertCircle,
  Calendar,
  Mail,
  ClipboardList,
  Mic,
  Phone,
} from "lucide-react";

const TYPE_ICONS = {
  task: ClipboardList,
  calendar: Calendar,
  email: Mail,
  call: Phone,
};

interface TimelineRowProps {
  action: Action;
  foMessage?: string; // Fo's actual response or clarification question
  onClarify: (id: string, value: string) => void;
}

export function TimelineRow({ action, foMessage, onClarify }: TimelineRowProps) {
  const [selectedClinic, setSelectedClinic] = useState("");
  const [customReply, setCustomReply] = useState("");
  const [listening, setListening] = useState(false);
  const [voiceError, setVoiceError] = useState("");
  const [canTalk, setCanTalk] = useState(false);
  const spokenKey = useRef("");
  const Icon = TYPE_ICONS[action.type];

  useEffect(() => {
    setCanTalk(voiceInputSupported());
  }, []);

  useEffect(() => {
    if (!foMessage) return;
    if (action.status !== "needs_clarification") return;
    const key = `${action.status}:${foMessage}`;
    if (spokenKey.current === key) return;
    spokenKey.current = key;
    let cancelled = false;
    speak(foMessage).then((finished) => {
      if (!finished || cancelled || action.status !== "needs_clarification" || !voiceFollowUpEnabled()) {
        return;
      }
      beginListening(true);
    });
    return () => {
      cancelled = true;
    };
    // beginListening is recreated each render; speech should run only when the reply changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [foMessage, action.status]);

  function beginListening(quiet = false) {
    setVoiceError("");
    setListening(true);
    enableVoiceFollowUp();
    listen({
      onPartial: (text) => {
        const clinic = clinicFromReply(text);
        if (clinic) setSelectedClinic(clinic);
        else setCustomReply(text);
      },
      onFinal: (text) => {
        setListening(false);
        if (!text || heardItself(text, foMessage)) return;
        const askingClinic =
          action.status === "needs_clarification" &&
          !action.filledClinic &&
          shouldOfferClinicChoices(foMessage, action.missing?.includes("clinic") ?? false);
        const clinic = askingClinic ? clinicFromReply(text) : undefined;
        if (clinic) {
          setSelectedClinic(clinic);
          onClarify(action.id, clinic);
          return;
        }
        setCustomReply(text);
        onClarify(action.id, text);
      },
      onEnd: () => setListening(false),
      onError: (message) => {
        setListening(false);
        setVoiceError(message);
      },
    }, { quiet });
  }

  function toggleListening() {
    if (listening) {
      stopListening();
      setListening(false);
      return;
    }
    stopSpeaking();
    beginListening();
  }

  const statusIcon = {
    ready: null,
    needs_input: null,
    processing: <Loader2 className="w-5 h-5 text-blue-500 animate-spin" />,
    done: <CheckCircle className="w-5 h-5 text-emerald-500" />,
    needs_clarification: <AlertCircle className="w-5 h-5 text-orange-500" />,
    failed: <XCircle className="w-5 h-5 text-red-500" />,
  }[action.status];

  const rowBg = {
    ready: "bg-white",
    needs_input: "bg-white",
    processing: "bg-blue-50",
    done: "bg-emerald-50",
    needs_clarification: "bg-orange-50",
    failed: "bg-red-50",
  }[action.status];

  const borderColor =
    action.status === "needs_clarification"
      ? "border-orange-300"
      : action.status === "done"
      ? "border-emerald-200"
      : action.status === "failed"
      ? "border-red-200"
      : "border-gray-200";

  const isClinicQuestion =
    action.status === "needs_clarification" &&
    !action.filledClinic &&
    shouldOfferClinicChoices(foMessage, action.missing?.includes("clinic") ?? false);

  return (
    <div
      className={`rounded-xl border shadow-sm overflow-hidden transition-all duration-300 ${rowBg} ${borderColor}`}
    >
      <div className="flex items-center gap-3 px-4 py-3">
        <div
          className={`p-1.5 rounded-lg flex-shrink-0 ${
            action.status === "done"
              ? "bg-emerald-100"
              : action.status === "needs_clarification"
              ? "bg-orange-100"
              : action.status === "failed"
              ? "bg-red-100"
              : "bg-gray-100"
          }`}
        >
          <Icon
            className={`w-4 h-4 ${
              action.status === "done"
                ? "text-emerald-600"
                : action.status === "needs_clarification"
                ? "text-orange-600"
                : action.status === "failed"
                ? "text-red-600"
                : "text-gray-500"
            }`}
          />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-800 truncate">{action.label}</p>
          {action.status === "done" && foMessage && action.type !== "call" && (
            <p className="text-xs text-emerald-600 mt-0.5 line-clamp-2">{foMessage}</p>
          )}
          {action.status === "failed" && foMessage && (
            <p className="text-xs text-red-500 mt-0.5">{foMessage}</p>
          )}
          {action.status === "processing" && (
            <p className="text-xs text-blue-500 mt-0.5">{foMessage || "Fo is working on it…"}</p>
          )}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <StatusBadge status={action.status} />
          {statusIcon}
        </div>
      </div>

      {action.type === "call" && action.status === "done" && (
        <div className="px-4 pb-3">
          {!!action.callKeywords?.length && (
            <div className="flex flex-wrap gap-1.5 mb-2">
              {action.callKeywords.map((word) => (
                <span key={word} className="text-xs font-medium bg-emerald-100 text-emerald-800 rounded-full px-2 py-0.5">
                  {word}
                </span>
              ))}
            </div>
          )}
          {foMessage && (
            <p className="text-xs text-gray-600">
              {action.callKeywords?.length ? `They said: ${foMessage}` : foMessage}
            </p>
          )}
        </div>
      )}

      {action.status === "needs_clarification" && (
        <div className="px-4 pb-4 border-t border-orange-200 pt-3">
          {foMessage && (
            <p className="text-sm font-medium text-orange-800 mb-3">{foMessage}</p>
          )}

          {isClinicQuestion ? (
            <>
              <RadioGroup
                value={selectedClinic}
                onValueChange={setSelectedClinic}
                name={`clinic-${action.id}`}
                className="space-y-2 mb-3"
              >
                {CLINIC_OPTIONS.map((option, index) => {
                  const optionId = `clinic-${action.id}-${index}`;
                  return (
                    <div key={option} className="flex items-start gap-2">
                      <RadioGroupItem value={option} id={optionId} className="mt-0.5" />
                      <Label htmlFor={optionId} className="text-sm text-gray-700 leading-tight cursor-pointer">
                        {option}
                      </Label>
                    </div>
                  );
                })}
              </RadioGroup>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  size="sm"
                  disabled={!selectedClinic}
                  onClick={() => {
                    stopSpeaking();
                    stopListening();
                    setListening(false);
                    onClarify(action.id, selectedClinic);
                  }}
                  className="bg-[#10B981] hover:bg-[#059669] text-white"
                >
                  Confirm selection
                </Button>
                {canTalk && (
                  <TalkButton listening={listening} onClick={toggleListening} />
                )}
              </div>
            </>
          ) : (
            // Generic clarification — let user type a reply
            <div className="space-y-2">
              <input
                type="text"
                value={customReply}
                onChange={(e) => setCustomReply(e.target.value)}
                placeholder="Type your answer…"
                className="w-full text-sm border border-orange-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-orange-300"
              />
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  size="sm"
                  disabled={!customReply.trim()}
                  onClick={() => onClarify(action.id, customReply)}
                  className="bg-[#10B981] hover:bg-[#059669] text-white"
                >
                  Send reply
                </Button>
                {canTalk && (
                  <TalkButton listening={listening} onClick={toggleListening} />
                )}
              </div>
            </div>
          )}
          {listening && <p className="text-xs text-orange-700 mt-2">Listening…</p>}
          {voiceError && <p className="text-xs text-red-600 mt-2">{voiceError}</p>}
        </div>
      )}
    </div>
  );
}

function heardItself(heard: string, said?: string) {
  if (!said) return false;
  const clean = (value: string) => value.toLowerCase().replace(/[^a-z0-9 ]/g, "").trim();
  const reply = clean(heard);
  const prompt = clean(said);
  if (reply.length < 12) return false;
  return prompt.includes(reply) || reply.includes(prompt.slice(0, 48));
}

function TalkButton({ listening, onClick }: { listening: boolean; onClick: () => void }) {
  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      onClick={onClick}
      className="border-orange-200 text-orange-800"
    >
      {listening ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mic className="w-4 h-4" />}
      {listening ? "Stop" : "Talk to Fo"}
    </Button>
  );
}
