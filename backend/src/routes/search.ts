import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { searchKanunMaddeleri } from "../lib/kanunSearch";

export const searchRouter = Router();

// POST /search/kanun-maddeleri
searchRouter.post("/kanun-maddeleri", requireAuth, async (req, res) => {
  const query = typeof req.body?.query === "string" ? req.body.query.trim() : "";
  const limitRaw = Number(req.body?.limit ?? 5);
  const thresholdRaw = Number(req.body?.match_threshold ?? 0.5);

  if (!query) {
    return void res.status(400).json({ detail: "query is required" });
  }

  const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(Math.trunc(limitRaw), 1), 20) : 5;
  const matchThreshold = Number.isFinite(thresholdRaw)
    ? Math.min(Math.max(thresholdRaw, 0), 1)
    : 0.5;

  try {
    const results = await searchKanunMaddeleri({
      query,
      limit,
      matchThreshold,
    });
    res.json({ query, limit, match_threshold: matchThreshold, results });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    res.status(500).json({ detail: message });
  }
});