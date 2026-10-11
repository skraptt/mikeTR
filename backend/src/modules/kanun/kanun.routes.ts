// HTTP layer for the kanun (Turkish statute search) module.

import { Router } from "express";
import { requireAuth } from "../../middleware/auth";
import { asyncRoute, routerErrorHandler } from "../../middleware/asyncRoute";
import { createServerSupabase } from "../../lib/supabase";
import { sendServiceFailure } from "../../lib/serviceResult";
import { searchStatutes } from "./kanun.service";

export const kanunRouter = Router();

// POST /kanun/search  { query, limit? } -> { query, results }
kanunRouter.post(
  "/search",
  requireAuth,
  asyncRoute(async (req, res) => {
    const result = await searchStatutes(createServerSupabase(), req.body);
    if (!result.ok) return void sendServiceFailure(res, result);
    res.json(result.data);
  }),
);

kanunRouter.use(routerErrorHandler("[kanun]"));
