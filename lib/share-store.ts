import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import type { CareData } from "@/lib/types";
import type { Action } from "@/lib/types";

export interface ShareRecord {
  token: string;
  createdAt: string;
  status: string;
  notes: string | null;
  data: CareData;
  approved_actions?: Action[] | null;
}

const FILE = path.join(process.cwd(), ".data", "shares.json");

async function loadAll(): Promise<Record<string, ShareRecord>> {
  try {
    return JSON.parse(await readFile(FILE, "utf8")) as Record<string, ShareRecord>;
  } catch {
    return {};
  }
}

async function saveAll(records: Record<string, ShareRecord>) {
  await mkdir(path.dirname(FILE), { recursive: true });
  await writeFile(FILE, JSON.stringify(records, null, 2));
}

export async function createShare(record: Omit<ShareRecord, "token" | "createdAt">): Promise<ShareRecord> {
  const token = crypto.randomUUID().replace(/-/g, "").slice(0, 12);
  const saved: ShareRecord = {
    ...record,
    token,
    createdAt: new Date().toISOString(),
  };
  const all = await loadAll();
  all[token] = saved;
  await saveAll(all);
  return saved;
}

export async function getShare(token: string): Promise<ShareRecord | null> {
  const all = await loadAll();
  return all[token] ?? null;
}

export async function updateShare(token: string, updates: Partial<ShareRecord>) {
  const all = await loadAll();
  if (!all[token]) return null;
  all[token] = { ...all[token], ...updates };
  await saveAll(all);
  return all[token];
}
