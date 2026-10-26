// HTTP layer for the hesap (deadline, interest and court fee calculation) module.

import { Router } from "express";
import { requireAuth } from "../../middleware/auth";
import { asyncRoute, routerErrorHandler } from "../../middleware/asyncRoute";
import { sendServiceFailure } from "../../lib/serviceResult";
import { faizHesabi, harcHesabi, sureHesabi } from "./hesap.service";

export const hesapRouter = Router();

const route = (
  fn: (
    body: unknown,
  ) =>
    | ReturnType<typeof sureHesabi>
    | ReturnType<typeof faizHesabi>
    | ReturnType<typeof harcHesabi>,
) =>
  asyncRoute(async (req, res) => {
    const result = fn(req.body);
    if (!result.ok) return void sendServiceFailure(res, result);
    res.json(result.data);
  });

// POST /hesap/sure  { baslangic, sure, birim, rejim, adliTatileTabi? }
hesapRouter.post("/sure", requireAuth, route(sureHesabi));
// POST /hesap/faiz  { anapara, baslangic, bitis, tur }
hesapRouter.post("/faiz", requireAuth, route(faizHesabi));
// POST /hesap/harc  { mahkeme, deger?, olumCismaniZarar? }
hesapRouter.post("/harc", requireAuth, route(harcHesabi));

hesapRouter.use(routerErrorHandler("[hesap]"));
