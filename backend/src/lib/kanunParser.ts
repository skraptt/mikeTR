// mikeTR: splits the text of a Turkish law into articles.
//
// Used by scripts/kanun/import-kanunlar.ts (text files in setup-data/) and by
// the daily statute check (lib/kanunSync.ts), which reads the current text
// from mevzuat.gov.tr. Both must parse identically, or the check would
// report formatting differences as amendments.

export type ParsedMadde = {
  kanun_no: string;
  kanun_adi: string;
  madde_no: string;
  baslik: string | null;
  icerik: string;
};

// "MADDE 1-", "Madde 1 –", "Geçici Madde 2-", "EK MADDE 3 –", "Madde 1/A –", "MADDE 146 ila 149 –"
// "İ" büyük/küçük harf duyarsız eşleşmede "i" sayılmadığı için açıkça yazıldı.
const HEADING = /^\s*(?:(ge[çÇ][iİ]c[iİ]|ek)\s+)?madde\s+(\d+(?:\/[a-zçğıöşü])?)(?:\s+ila\s+(\d+))?\s*[-–—]\s*/iu;

function trUpperFirst(word: string): string {
  return word.charAt(0).toLocaleUpperCase("tr-TR") + word.slice(1);
}

function titleCaseTr(text: string): string {
  return text
    .toLocaleLowerCase("tr-TR")
    .split(/\s+/)
    .map((w) => (["ve", "ile", "hakkında"].includes(w) ? w : trUpperFirst(w)))
    .join(" ");
}

// Bir sonraki maddenin başlığı ya da bölüm adı olan satırlar: kısa, noktalama ile bitmeyen,
// "(1)" gibi fıkra numarasıyla başlamayan satırlar.
function isTitleLine(line: string): boolean {
  const t = line.trim();
  return (
    t.length > 0 &&
    t.length < 150 &&
    !/[.:;,]$/.test(t) &&
    !/^\(\d+\)/.test(t) &&
    // Masthead lines ("Yayımlandığı Düstur : Tertip : 5 Cilt : 49").
    !/\s:\s/.test(t)
  );
}

export function parseKanun(text: string, fileName: string): ParsedMadde[] {
  const allLines = text.replace(/\r\n?/g, "\n").split("\n");
  // Dosya sonundaki "İŞLENEMEYEN HÜKÜMLER" ve yürürlük tablosu bölümleri madde değildir.
  const tailStart = allLines.findIndex((l) => /İŞLENEMEYEN HÜKÜMLER|DEĞİŞİKLİK GETİREN MEVZUATIN/u.test(l));
  const lines = tailStart === -1 ? allLines : allLines.slice(0, tailStart);

  const noLine = lines.find((l) => /^\s*Kanun Numarası\s*:/i.test(l));
  const kanun_no = noLine?.split(":")[1]?.trim() || fileName.match(/^(\d+)/)?.[1];
  if (!kanun_no) throw new Error(`${fileName}: kanun numarası bulunamadı`);

  // The law's name is the first block of lines, ending at a blank line or,
  // in mevzuat.gov.tr's HTML (no blank lines), at the "Kanun Numarası" line.
  const titleLines: string[] = [];
  for (const l of lines) {
    if (!l.trim()) {
      if (titleLines.length) break;
      continue;
    }
    if (/^\s*Kanun Numarası\s*:/i.test(l)) break;
    titleLines.push(l.trim());
  }
  const kanun_adi = titleCaseTr(titleLines.join(" "));

  const headingIdx = lines.flatMap((l, i) => (HEADING.test(l) ? [i] : []));
  const result: ParsedMadde[] = [];
  let pendingTitle: string[] = [];

  // İlk maddenin başlığı, ondan hemen önceki başlık satırlarıdır (künye bloğundan sonra).
  for (let i = (headingIdx[0] ?? 0) - 1; i >= 0 && isTitleLine(lines[i]); i--) {
    pendingTitle.unshift(lines[i].trim());
  }

  for (let h = 0; h < headingIdx.length; h++) {
    const start = headingIdx[h];
    const end = h + 1 < headingIdx.length ? headingIdx[h + 1] : lines.length;
    const match = lines[start].match(HEADING)!;
    const prefix = match[1] ? (/^ek$/i.test(match[1]) ? "Ek " : "Geçici ") : "";
    const madde_no = prefix + match[2].toUpperCase() + (match[3] ? `-${match[3]}` : "");

    const body = [lines[start].slice(match[0].length), ...lines.slice(start + 1, end)];
    while (body.length && !body[body.length - 1].trim()) body.pop();

    // Gövdenin sonundaki başlık satırları bir sonraki maddeye aittir.
    const nextTitle: string[] = [];
    if (h + 1 < headingIdx.length) {
      while (body.length > 1 && isTitleLine(body[body.length - 1])) {
        nextTitle.unshift(body.pop()!.trim());
        while (body.length && !body[body.length - 1].trim()) body.pop();
      }
    }

    const icerik = body.map((l) => l.trim()).filter(Boolean).join("\n");
    // Bölüm adları ("BİRİNCİ KISIM") başlığı uzatmasın; en yakın iki satır yeterli.
    const baslik = pendingTitle.slice(-2).join(" / ") || null;
    result.push({ kanun_no, kanun_adi, madde_no, baslik, icerik });
    pendingTitle = nextTitle;
  }

  return result;
}

/** Keeps the first occurrence of each article number; later ones are amendment text quoting it. */
export function dedupeMaddeler(maddeler: ParsedMadde[]): ParsedMadde[] {
  const seen = new Set<string>();
  return maddeler.filter((m) => {
    if (seen.has(m.madde_no)) return false;
    seen.add(m.madde_no);
    return true;
  });
}
