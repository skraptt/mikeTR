// Arama ifadesini Bakanlık karar servislerinin anladığı VE sorgusuna çevirir.
//
// Bedesten (Yargıtay) ve UYAP Emsal düz sözcükleri VEYA ile arar: "kira tahliye"
// iki sözcükten birini içeren yüz binlerce kararı getirir. Bu yüzden:
//   - sözcükler ve tırnaklı ifadeler `+` ile zorunlu kılınır;
//   - başında `-` olan sözcük ya da ifade hariç tutulur;
//   - kesme işaretinden sonraki ek atılır ("TMK'nın" -> "TMK");
//   - AND / OR / NOT (and / or küçük harfle de) yazılmışsa kullanıcının sözdizimine
//     dokunulmaz; yalnız baştaki, sondaki ve art arda gelen işleçler atılır. Küçük
//     "not" Türkçede sözcüktür ("tapuya not düşülmesi"), işleç sayılmaz;
//   - harf, rakam, boşluk, tırnak, + ve - dışındaki işaretler boşluğa çevrilir
//     (Bedesten diğerlerini reddeder, UYAP Emsal noktada hata verir).
//
// aydincan/turk-hukuku-ictihat-mcp (MIT) içindeki ve_sorgusu'nun TypeScript karşılığı.

const OPERATORS = new Set(["AND", "OR", "NOT"]);
const LOWER_OPERATORS = new Set(["and", "or"]);
const PART = /([+-]?)("[^"]*"|[^\s"]+)/gu;

function operatorOf(sign: string, body: string): string | null {
  if (sign) return null;
  if (OPERATORS.has(body)) return body;
  if (LOWER_OPERATORS.has(body)) return body.toUpperCase();
  return null;
}

export function andQuery(input: string): string {
  let s = (input ?? "").replace(/['’‘`´][\p{L}\p{N}_]*/gu, "");
  s = s.replace(/[^\p{L}\p{N}\s"+-]|_/gu, " ");
  // Eşlenmemiş tırnak servis hatası verir.
  if ((s.match(/"/g) ?? []).length % 2) s = s.replace(/"/g, " ");

  const parts: [string, string][] = [];
  for (const [, sign, body] of s.matchAll(PART)) {
    if (body.startsWith('"')) {
      const inner = body.slice(1, -1).replace(/[+-]/g, " ").split(/\s+/).filter(Boolean).join(" ");
      if (inner) parts.push([sign, `"${inner}"`]);
      continue;
    }
    // Sözcük içindeki + ve - ayırıcıdır ("a+b", "iş-güç"); yalnız kalan işaret atılır.
    body
      .split(/[+-]+/)
      .filter(Boolean)
      .forEach((word, i) => parts.push([i === 0 ? sign : "", word]));
  }

  let out: string[];
  if (parts.some(([sign, body]) => operatorOf(sign, body))) {
    out = [];
    for (const [sign, body] of parts) {
      const op = operatorOf(sign, body);
      if (op) {
        if (out.length && !OPERATORS.has(out[out.length - 1])) out.push(op);
      } else {
        out.push(sign + body);
      }
    }
    while (out.length && OPERATORS.has(out[out.length - 1])) out.pop();
  } else {
    out = parts.map(([sign, body]) => (sign || "+") + body);
  }

  if (!out.length) throw new Error("Arama ifadesi harf ya da rakam içermeli.");
  return out.join(" ");
}
