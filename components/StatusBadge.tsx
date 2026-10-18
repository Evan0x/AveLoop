"use client";

import { Badge } from "@/components/ui/badge";
import type { Action } from "@/lib/types";

interface StatusBadgeProps {
  status: Action["status"];
  className?: string;
}

const STATUS_CONFIG: Record<Action["status"], { label: string; className: string }> = {
  ready: { label: "Ready", className: "bg-emerald-100 text-emerald-700 border-emerald-200" },
  needs_input: { label: "Needs Input", className: "bg-orange-100 text-orange-700 border-orange-200" },
  processing: { label: "Processing", className: "bg-blue-100 text-blue-700 border-blue-200" },
  done: { label: "Done", className: "bg-emerald-100 text-emerald-700 border-emerald-200" },
  needs_clarification: {
    label: "Needs Clarification",
    className: "bg-orange-100 text-orange-700 border-orange-200",
  },
  failed: { label: "Failed", className: "bg-red-100 text-red-700 border-red-200" },
};

export function StatusBadge({ status, className = "" }: StatusBadgeProps) {
  const config = STATUS_CONFIG[status];
  return (
    <Badge variant="outline" className={`text-xs font-medium ${config.className} ${className}`}>
      {config.label}
    </Badge>
  );
}
