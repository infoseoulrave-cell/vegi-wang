import { promises as fs } from "node:fs";
import path from "node:path";

/**
 * 소비자 "니즈 DB"의 시드(seed) 저장소.
 * MVP 단계에서는 로컬 JSON 파일에 append 하며, 파일시스템이 읽기전용인 환경에서는
 * 인메모리로 폴백한다. 정식 단계에서는 DB(Postgres 등)로 교체한다.
 */

export interface WaitlistEntry {
  email: string;
  /** 소비자가 가장 관심 있는 품목 (니즈 신호) */
  interest: string;
  createdAt: string;
}

const DATA_DIR = path.join(process.cwd(), ".data");
const FILE = path.join(DATA_DIR, "waitlist.json");

const memory: WaitlistEntry[] = [];

async function readFile(): Promise<WaitlistEntry[]> {
  try {
    const raw = await fs.readFile(FILE, "utf8");
    return JSON.parse(raw) as WaitlistEntry[];
  } catch {
    return [];
  }
}

export async function addEntry(
  email: string,
  interest: string,
): Promise<{ ok: true; total: number }> {
  const entry: WaitlistEntry = {
    email: email.toLowerCase(),
    interest,
    createdAt: new Date().toISOString(),
  };
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
    const list = await readFile();
    if (!list.some((e) => e.email === entry.email)) list.push(entry);
    await fs.writeFile(FILE, JSON.stringify(list, null, 2), "utf8");
    return { ok: true, total: list.length };
  } catch {
    if (!memory.some((e) => e.email === entry.email)) memory.push(entry);
    return { ok: true, total: memory.length };
  }
}

export async function countEntries(): Promise<number> {
  const list = await readFile();
  return Math.max(list.length, memory.length);
}
