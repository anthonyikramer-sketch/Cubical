import { Router } from "express";
import { randomUUID } from "crypto";
import { readStats, mergeAndSaveStats, type UserStats } from "../lib/stats-store.js";

const router = Router();

const COOKIE_NAME = "cubical_uid";
const COOKIE_MAX_AGE_MS = 365 * 24 * 60 * 60 * 1000; // 1 year

function getOrCreateUserId(
  req: Parameters<Parameters<typeof router.get>[1]>[0],
  res: Parameters<Parameters<typeof router.get>[1]>[1],
): string {
  const existing = (req.cookies as Record<string, string> | undefined)?.[COOKIE_NAME];
  if (existing && typeof existing === "string" && existing.length > 0) {
    return existing;
  }
  const uid = randomUUID();
  res.cookie(COOKIE_NAME, uid, {
    maxAge: COOKIE_MAX_AGE_MS,
    httpOnly: false, // readable by JS if needed for debugging
    sameSite: "lax",
    path: "/",
  });
  return uid;
}

/** GET /api/game-stats — return stored stats for this browser */
router.get("/game-stats", async (req, res) => {
  const uid = getOrCreateUserId(req, res);
  const stats = await readStats(uid);
  res.json({ ok: true, stats });
});

/** POST /api/game-stats — merge incoming stats with stored stats */
router.post("/game-stats", async (req, res) => {
  const uid = getOrCreateUserId(req, res);
  const incoming = req.body as Partial<UserStats>;
  const merged = await mergeAndSaveStats(uid, incoming);
  res.json({ ok: true, stats: merged });
});

export default router;
