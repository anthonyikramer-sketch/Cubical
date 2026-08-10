import fs from "fs/promises";
import path from "path";
import os from "os";

const STORE_PATH = path.join(os.homedir(), ".cubical-game-stats.json");

export interface UserStats {
  bestScores: Record<string, number>;
  dailyPlayed: Record<string, boolean>;
}

type StoreData = Record<string, UserStats>;

let cache: StoreData | null = null;
let dirtyTimer: ReturnType<typeof setTimeout> | null = null;

async function load(): Promise<StoreData> {
  if (cache !== null) return cache;
  try {
    const raw = await fs.readFile(STORE_PATH, "utf8");
    cache = JSON.parse(raw) as StoreData;
  } catch {
    cache = {};
  }
  return cache;
}

function scheduleSave(data: StoreData): void {
  if (dirtyTimer) clearTimeout(dirtyTimer);
  dirtyTimer = setTimeout(async () => {
    try {
      await fs.writeFile(STORE_PATH, JSON.stringify(data), "utf8");
    } catch (err) {
      // Non-fatal: log but don't throw
      console.warn("[stats-store] Failed to persist stats:", err);
    }
  }, 200);
}

export async function readStats(uid: string): Promise<UserStats> {
  const data = await load();
  return data[uid] ?? { bestScores: {}, dailyPlayed: {} };
}

export async function mergeAndSaveStats(
  uid: string,
  incoming: Partial<UserStats>,
): Promise<UserStats> {
  const data = await load();
  const existing = data[uid] ?? { bestScores: {}, dailyPlayed: {} };

  // Merge best scores: take max
  const bestScores: Record<string, number> = { ...existing.bestScores };
  for (const [k, v] of Object.entries(incoming.bestScores ?? {})) {
    if (typeof v === "number" && v > 0) {
      bestScores[k] = Math.max(bestScores[k] ?? 0, v);
    }
  }

  // Merge daily played: OR together (once played, always played)
  const dailyPlayed: Record<string, boolean> = { ...existing.dailyPlayed };
  for (const [k, v] of Object.entries(incoming.dailyPlayed ?? {})) {
    if (v === true) dailyPlayed[k] = true;
  }

  const merged: UserStats = { bestScores, dailyPlayed };
  data[uid] = merged;
  cache = data;
  scheduleSave(data);
  return merged;
}
