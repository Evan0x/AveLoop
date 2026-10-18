"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { StatusBadge } from "./StatusBadge";
import type { Action } from "@/lib/types";
import { CheckCircle, ChevronDown, ChevronUp, Clock, Calendar, Mail, ClipboardList } from "lucide-react";

const TYPE_ICONS = {
  task: ClipboardList,
  calendar: Calendar,
  email: Mail,
};

interface ActionCardProps {
  action: Action;
  onUpdate: (id: string, updates: Partial<Action>) => void;
}

const TIME_LABELS = ["Morning", "Afternoon", "Evening"];
const TIME_SUGGESTIONS = ["08:00", "12:00", "18:00"];

export function ActionCard({ action, onUpdate }: ActionCardProps) {
  const [expanded, setExpanded] = useState(action.status === "needs_input");
  const [updatedFields, setUpdatedFields] = useState<Set<string>>(new Set());

  const isReady = action.status === "ready";
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
        onClick={() => !isReady && setExpanded((e) => !e)}
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
            {!isReady && (
              expanded ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />
            )}
            {isReady && <CheckCircle className="w-5 h-5 text-emerald-500" />}
          </div>
        </div>
      </CardHeader>

      {!isReady && expanded && (
        <CardContent className="px-4 py-4 space-y-4 bg-white">
          {action.missing.includes("times") && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Clock className="w-4 h-4 text-orange-500" />
                <span className="text-sm font-medium text-gray-700">Set medication times</span>
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
                      defaultValue={TIME_SUGGESTIONS[i]}
                      onChange={(e) => handleTimeChange(i, e.target.value)}
                      className="text-sm h-9"
                    />
                  </div>
                ))}
              </div>
              <p className="text-xs text-gray-400 mt-1">Suggested: 8am / 12pm / 6pm</p>
            </div>
          )}

          {action.missing.includes("dates") && (
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

          {action.missing.includes("clinic") && (
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
