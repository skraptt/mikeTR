// mikeTR: süre, faiz ve harç hesaplarını Hesaplamalar sayfasına sunar.
//
// Sohbet modeli aynı hesaplara calculate_deadline, calculate_interest ve
// calculate_court_fees araçlarıyla ulaşır (chat/engine/tools/hesapTools.ts);
// bu cephe, bir kişinin sohbet açmadan hesap yapabilmesi içindir.

import type {
  FaizHesabiYaniti,
  HarcHesabiYaniti,
  SureHesabiYaniti,
} from "@mike/contracts";
import { SureHesabiHatasi, sureHesapla } from "../../lib/sureHesap";
import {
  FaizHesabiHatasi,
  TCMB_TABLO_TARIHI,
  faizHesapla,
} from "../../lib/faizHesap";
import {
  HARC_TARIFE_YILI,
  HarcHesabiHatasi,
  harcHesapla,
} from "../../lib/harcHesap";
import { failure, ok, type ServiceResult } from "../../lib/serviceResult";

type Govde = Record<string, unknown>;
const govde = (body: unknown): Govde =>
  body && typeof body === "object" ? (body as Govde) : {};
const metin = (v: unknown) => (typeof v === "string" ? v.trim() : "");

export function sureHesabi(body: unknown): ServiceResult<SureHesabiYaniti> {
  const b = govde(body);
  try {
    const r = sureHesapla({
      baslangic: metin(b.baslangic),
      sure: Number(b.sure),
      birim: metin(b.birim) as never,
      rejim: metin(b.rejim) as never,
      adliTatileTabi:
        typeof b.adliTatileTabi === "boolean" ? b.adliTatileTabi : undefined,
    });
    return ok(r);
  } catch (error) {
    if (error instanceof SureHesabiHatasi)
      return failure("validation", error.message);
    throw error;
  }
}

export function faizHesabi(body: unknown): ServiceResult<FaizHesabiYaniti> {
  const b = govde(body);
  try {
    const r = faizHesapla({
      anapara: Number(b.anapara),
      baslangic: metin(b.baslangic),
      bitis: metin(b.bitis),
      tur: metin(b.tur) as never,
    });
    return ok({ ...r, tabloTarihi: TCMB_TABLO_TARIHI });
  } catch (error) {
    if (error instanceof FaizHesabiHatasi)
      return failure("validation", error.message);
    throw error;
  }
}

export function harcHesabi(body: unknown): ServiceResult<HarcHesabiYaniti> {
  const b = govde(body);
  try {
    const deger =
      b.deger === undefined || b.deger === null || b.deger === ""
        ? undefined
        : Number(b.deger);
    const r = harcHesapla({
      mahkeme: metin(b.mahkeme) as never,
      deger,
      olumCismaniZarar: b.olumCismaniZarar === true,
    });
    return ok({ ...r, tarifeYili: HARC_TARIFE_YILI });
  } catch (error) {
    if (error instanceof HarcHesabiHatasi)
      return failure("validation", error.message);
    throw error;
  }
}
