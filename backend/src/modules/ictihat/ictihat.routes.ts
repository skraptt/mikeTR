// HTTP layer for the ictihat (Turkish case-law search) module.

import { Router } from "express";
import { requireAuth } from "../../middleware/auth";
import { asyncRoute, routerErrorHandler } from "../../middleware/asyncRoute";
import { sendServiceFailure } from "../../lib/serviceResult";
import { readCaseLawDecision, searchCaseLaw } from "./ictihat.service";

export const ictihatRouter = Router();

// POST /ictihat/search  { query, court?, limit?, page? } -> { query, court, page, total, results }
ictihatRouter.post(
  "/search",
  requireAuth,
  asyncRoute(async (req, res) => {
    const result = await searchCaseLaw(req.body);
    if (!result.ok) return void sendServiceFailure(res, result);
    res.json(result.data);
  }),
);

// GET /ictihat/karar/:id -> { id, kaynak, metin }
ictihatRouter.get(
  "/karar/:id",
  requireAuth,
  asyncRoute(async (req, res) => {
    const result = await readCaseLawDecision(String(req.params.id));
    if (!result.ok) return void sendServiceFailure(res, result);
    res.json(result.data);
  }),
);

ictihatRouter.use(routerErrorHandler("[ictihat]"));
