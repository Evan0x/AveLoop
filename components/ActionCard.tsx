"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { StatusBadge } from "./StatusBadge";
import { SUGGESTED_MEDICATION_TIMES, type Action } from "@/lib/types";
import { CheckCircle, ChevronDown, ChevronUp, Clock, Calendar, Mail, ClipboardList, Phone } from "lucide-react";

const TYPE_ICONS = {
  task: ClipboardList,
  calendar: Calendar,
  email: Mail,
  call: Phone,
};

interface ActionCardProps {
  action: Action;
  onUpdate: (id: string, updates: Partial<Action>) => void;
}

const TIME_LABELS = ["Morning", "Afternoon", "Evening"];
const TIME_SUGGESTIONS = [...SUGGESTED_MEDICATION_TIMES];

export function ActionCard({ action, onUpdate }: ActionCardProps) {
  const [expanded, setExpanded] = useState(action.status === "needs_input");
  const [updatedFields, setUpdatedFields] = useState<Set<string>>(new Set());

  const hasOptionalTimes = action.missing.includes("times");
  const needsPhone = action.missing.includes("phone") || action.type === "call";
  const isReady = action.status === "ready";
  const canExpand = !isReady || hasOptionalTimes;
  const Icon = TYPE_ICONS[action.type];

  function markUpdated(field: string) {
    setUpdatedFields((prev) => new Set(prev).add(field));
  }

  function handleTimeChange(index: number, value: string) {
    const times = action.filledTimes ? [...action.filledTimes] : ["", "", ""];
    times[index] = value;
    onUpdate(action.id, { filledTimes: times });
    markUpdated("times");
  }

  function handleDateChange(value: string) {
    onUpdate(action.id, { filledDate: value });
    markUpdated("dates");
  }

  const borderColor = isReady ? "border-emerald-200" : "border-orange-200";
  const headerBg = isReady ? "bg-emerald-50" : "bg-orange-50";

  return (
    <Card className={`rounded-xl shadow-sm border ${borderColor} overflow-hidden`}>
      <CardHeader
        className={`${headerBg} py-3 px-4 cursor-pointer select-none`}
        onClick={() => canExpand && setExpanded((open) => !open)}
      >
        <div className="flex items-center gap-3">
          <div className={`p-1.5 rounded-lg ${isReady ? "bg-emerald-100" : "bg-orange-100"}`}>
            <Icon className={`w-4 h-4 ${isReady ? "text-emerald-600" : "text-orange-600"}`} />
          </div>
          <div className="flex-1 min-w-0">
            <CardTitle className="text-sm font-semibold text-gray-800 truncate">{action.label}</CardTitle>
            <p className="text-xs text-gray-500 mt-0.5 line-clamp-1">{action.instruction}</p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <StatusBadge status={action.status} />
            {canExpand && (
              expanded ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />
            )}
            {isReady && <CheckCircle className="w-5 h-5 text-emerald-500" />}
          </div>
        </div>
      </CardHeader>

      {(hasOptionalTimes || needsPhone || expanded) && (
        <CardContent className="px-4 py-4 space-y-4 bg-white">
          {hasOptionalTimes && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Clock className="w-4 h-4 text-orange-500" />
                <span className="text-sm font-medium text-gray-700">Times (optional)</span>
                {updatedFields.has("times") && (
                  <span className="text-xs text-emerald-600 font-medium">✓ Updated</span>
                )}
              </div>
              <div className="grid grid-cols-3 gap-2">
                {TIME_LABELS.map((label, i) => (
                  <div key={label}>
                    <Label className="text-xs text-gray-500 mb-1 block">{label}</Label>
                    <Input
                      type="time"
                      value={action.filledTimes?.[i] || TIME_SUGGESTIONS[i]}
                      onChange={(e) => handleTimeChange(i, e.target.value)}
                      className="text-sm h-9"
                    />
                  </div>
                ))}
              </div>
              <p className="text-xs text-gray-400 mt-1">Using 8am, 12pm, and 6pm unless you change them.</p>
            </div>
          )}

          {needsPhone && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Phone className="w-4 h-4 text-orange-500" />
                <span className="text-sm font-medium text-gray-700">Phone (optional)</span>
              </div>
              <Input
                type="tel"
                inputMode="tel"
                placeholder="(555) 010-2030"
                value={action.filledPhone ?? ""}
                onChange={(e) => onUpdate(action.id, { filledPhone: e.target.value })}
                className="text-sm h-9"
              />
              <p className="text-xs text-gray-400 mt-1">Leave this blank to skip the call. If you add a number, Fo calls it, listens, and shows the keywords.</p>
            </div>
          )}

          {expanded && action.missing.includes("dates") && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Calendar className="w-4 h-4 text-orange-500" />
                <span className="text-sm font-medium text-gray-700">Set appointment date</span>
                {updatedFields.has("dates") && (
                  <span className="text-xs text-emerald-600 font-medium">✓ Updated</span>
                )}
              </div>
              <Input
                type="date"
                onChange={(e) => handleDateChange(e.target.value)}
                className="text-sm h-9"
                min={new Date().toISOString().split("T")[0]}
              />
            </div>
          )}

          {expanded && !isReady && action.missing.includes("clinic") && (
            <div className="rounded-lg bg-orange-50 border border-orange-100 px-3 py-2">
              <p className="text-sm font-medium text-orange-800">Fo will ask which clinic</p>
              <p className="text-xs text-orange-700 mt-1">
                Several Riverside locations match. After you send this to Fo, it will ask you to pick the right one.
              </p>
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}
