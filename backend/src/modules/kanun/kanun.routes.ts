// HTTP layer for the kanun (Turkish statute search) module.

import { Router, type NextFunction, type Request, type Response } from "express";
import { requireAuth } from "../../middleware/auth";
import { asyncRoute, routerErrorHandler } from "../../middleware/asyncRoute";
import { createServerSupabase } from "../../lib/supabase";
import { sendServiceFailure } from "../../lib/serviceResult";
import { logError } from "../../lib/log";
import {
  decideStatuteUpdate,
  getStatuteStatus,
  isStatuteAdmin,
  listStatuteUpdates,
  searchStatutes,
  startStatuteCheck,
} from "./kanun.service";

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

// GET /kanun/status -> how current each law is, and whether the caller reviews changes
kanunRouter.get(
  "/status",
  requireAuth,
  asyncRoute(async (_req, res) => {
    const result = await getStatuteStatus(
      createServerSupabase(),
      res.locals.userEmail as string | undefined,
    );
    if (!result.ok) return void sendServiceFailure(res, result);
    res.json(result.data);
  }),
);

// Reviewing changes is limited to the addresses in KANUN_ADMIN_EMAILS.
function requireStatuteAdmin(_req: Request, res: Response, next: NextFunction) {
  if (!isStatuteAdmin(res.locals.userEmail as string | undefined)) {
    return void res.status(403).json({
      detail: "Only a statute admin can review statute changes.",
      code: "forbidden",
    });
  }
  next();
}

// GET /kanun/updates -> pending changes and each law's check state
kanunRouter.get(
  "/updates",
  requireAuth,
  requireStatuteAdmin,
  asyncRoute(async (_req, res) => {
    const result = await listStatuteUpdates(createServerSupabase());
    if (!result.ok) return void sendServiceFailure(res, result);
    res.json(result.data);
  }),
);

// POST /kanun/updates/check -> starts a check in the background
kanunRouter.post(
  "/updates/check",
  requireAuth,
  requireStatuteAdmin,
  asyncRoute(async (_req, res) => {
    const started = startStatuteCheck(createServerSupabase(), undefined, (error) =>
      logError("kanun-check", error),
    );
    res.status(202).json({ started });
  }),
);

// POST /kanun/updates/:id/approve | /reject
for (const decision of ["approve", "reject"] as const) {
  kanunRouter.post(
    `/updates/:id/${decision}`,
    requireAuth,
    requireStatuteAdmin,
    asyncRoute(async (req, res) => {
      const result = await decideStatuteUpdate(createServerSupabase(), {
        id: String(req.params.id),
        decision,
        actorEmail: res.locals.userEmail as string,
      });
      if (!result.ok) return void sendServiceFailure(res, result);
      res.json(result.data);
    }),
  );
}

kanunRouter.use(routerErrorHandler("[kanun]"));
