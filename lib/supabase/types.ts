import type { Action, CareData } from "@/lib/types";

export type CarePlanStatus = "extracted" | "executing" | "done";

export interface CarePlanRow {
  id: string;
  user_id: string;
  notes: string | null;
  data: CareData;
  approved_actions: Action[] | null;
  status: CarePlanStatus;
  created_at: string;
  updated_at: string;
}
