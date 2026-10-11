import type { StatuteCitation, StatuteCitationStatus } from "@mike/contracts";
import type { Db } from "./supabase";

// Asistan cevabındaki kanun maddesi atıflarını ayıklar ve her birini
// sohbetteki kanun aramalarının sonuçlarına ve kanun_maddeleri tablosuna göre doğrular.

type Law = { no: string; short: string; abbrs: string[]; names: string[] };

// Veritabanındaki kanunlar. `names` küçük harfli, Türkçe ek almamış hâlleridir.
const LAWS: Law[] = [
    { no: "4721", short: "TMK", abbrs: ["TMK", "MK"], names: ["türk medeni kanunu", "türk medenî kanunu", "medeni kanun"] },
    { no: "4722", short: "4722 s. K.", abbrs: [], names: [] },
    { no: "5846", short: "FSEK", abbrs: ["FSEK"], names: ["fikir ve sanat eserleri kanunu"] },
    { no: "5941", short: "Çek K.", abbrs: ["ÇK"], names: ["çek kanunu", "çek k."] },
    { no: "6098", short: "TBK", abbrs: ["TBK"], names: ["türk borçlar kanunu", "borçlar kanunu"] },
    { no: "6100", short: "HMK", abbrs: ["HMK"], names: ["hukuk muhakemeleri kanunu"] },
    { no: "6101", short: "6101 s. K.", abbrs: [], names: [] },
    { no: "6102", short: "TTK", abbrs: ["TTK"], names: ["türk ticaret kanunu"] },
    { no: "6103", short: "6103 s. K.", abbrs: [], names: [] },
    { no: "6362", short: "SPK", abbrs: ["SPK", "SPKn"], names: ["sermaye piyasası kanunu"] },
    { no: "6502", short: "TKHK", abbrs: ["TKHK"], names: ["tüketicinin korunması hakkında kanun"] },
    { no: "6698", short: "KVKK", abbrs: ["KVKK"], names: ["kişisel verilerin korunması kanunu"] },
    { no: "6769", short: "SMK", abbrs: ["SMK"], names: ["sınai mülkiyet kanunu"] },
];

// Sık geçen ama veritabanında olmayan kanunlar; etiket için kullanılır.
const OUTSIDE_LAWS: { label: string; abbrs: string[]; names: string[] }[] = [
    { label: "İş Kanunu", abbrs: ["İK", "İşK"], names: ["iş kanunu"] },
    { label: "İİK", abbrs: ["İİK"], names: ["icra ve iflas kanunu"] },
    { label: "TCK", abbrs: ["TCK"], names: ["türk ceza kanunu"] },
    { label: "CMK", abbrs: ["CMK"], names: ["ceza muhakemesi kanunu"] },
    { label: "İYUK", abbrs: ["İYUK"], names: ["idari yargılama usulü kanunu"] },
    { label: "Anayasa", abbrs: ["AY"], names: ["anayasa"] },
];


type RawCitation = { lawNo: string | null; lawLabel: string; madde: string };

const UPPER = "A-ZÇĞİÖŞÜ";
const WORD = "A-Za-zÇĞİÖŞÜçğıöşü";
// "315", "1/A", "352/2", "Geçici 1"
const NUM = `(?:(?:geçici|ek)\\s+)?\\d+(?:\\/[A-Za-z0-9]+)?`;
const NUM_LIST = `${NUM}(?:\\s*(?:,|ve|ile|-|–)\\s*${NUM})*`;
// "md. 315", "m. 315", "madde 315", "maddesi 315"
const ART_PREFIX = new RegExp(`^\\s*[,']?\\s*(?:(geçici|ek)\\s+)?(?:md\\.|m\\.|madde(?:si)?)\\s*(${NUM_LIST})`, "iu");
// "'nun 315. maddesi", "315 inci maddesi", "315 ve 316. maddeleri",
// "'nun halen yürürlükte olan 14. maddesi" (arada en fazla dört sözcük)
const ART_SUFFIX = new RegExp(
    `^[${WORD}'’]*(?:\\s+[${WORD}'’]+){0,4}?\\s*(?:(geçici|ek)\\s+)?(${NUM_LIST})\\s*\\.?\\s*(?:(?:inci|nci|ıncı|ncı|üncü|uncu|ncü|ncu)\\s+)?(?:madde|maddesi|maddesinde|maddesine|maddesinin|maddeleri|maddelerinde)(?![${WORD}])`,
    "iu",
);

function normalizeMadde(raw: string, prefix?: string): string {
    const m = raw.trim().match(/^(?:(geçici|ek)\s+)?(\d+)(?:\/([A-Za-z0-9]+))?$/iu);
    if (!m) return raw.trim();
    const kind = (m[1] ?? prefix)?.toLocaleLowerCase("tr-TR");
    const lead = kind === "geçici" ? "Geçici " : kind === "ek" ? "Ek " : "";
    // "1/A" alt maddedir; "352/2" ise fıkra numarasıdır ve atılır.
    const sub = m[3] && /^[A-Za-z]$/.test(m[3]) ? `/${m[3].toUpperCase()}` : "";
    return `${lead}${m[2]}${sub}`;
}

function splitNumbers(list: string, prefix?: string): string[] {
    return list
        .split(/\s*(?:,|\bve\b|\bile\b|-|–)\s*/iu)
        .filter(Boolean)
        .map((n) => normalizeMadde(n, prefix));
}

type Mention = { index: number; end: number; lawNo: string | null; label: string };

function findLawMentions(text: string): Mention[] {
    const mentions: Mention[] = [];
    const lower = text.toLocaleLowerCase("tr-TR");
    const add = (index: number, length: number, lawNo: string | null, label: string) =>
        mentions.push({ index, end: index + length, lawNo, label });

    for (const law of LAWS) {
        for (const abbr of law.abbrs) {
            const re = new RegExp(`(?<![${WORD}])${abbr}(?![${WORD}])`, "gu");
            for (const m of text.matchAll(re)) add(m.index!, m[0].length, law.no, law.short);
        }
        for (const name of law.names) {
            let i = lower.indexOf(name);
            while (i !== -1) {
                add(i, name.length, law.no, law.short);
                i = lower.indexOf(name, i + name.length);
            }
        }
    }
    for (const law of OUTSIDE_LAWS) {
        for (const abbr of law.abbrs) {
            const re = new RegExp(`(?<![${WORD}])${abbr}(?![${WORD}])`, "gu");
            for (const m of text.matchAll(re)) add(m.index!, m[0].length, null, law.label);
        }
        for (const name of law.names) {
            const re = new RegExp(`(?<![${WORD}])${name}`, "gu");
            for (const m of lower.matchAll(re)) add(m.index!, m[0].length, null, law.label);
        }
    }
    // "1475 sayılı (mülga) İş Kanunu" gibi numarayla anılan kanunlar.
    // `\b` Türkçe harfleri sözcük karakteri saymaz ("sayılı" "ı" ile biter), bu yüzden açık sınır kullanılır.
    for (const m of text.matchAll(new RegExp(`(?<!\\d)(\\d{3,5})\\s+sayılı(?![${WORD}])`, "gu"))) {
        const law = LAWS.find((l) => l.no === m[1]);
        add(m.index!, m[0].length, law?.no ?? null, law?.short ?? `${m[1]} s. K.`);
    }
    // Bilinmeyen kısaltmalar: "XYZ md. 5" — veritabanında olmadığı varsayılır.
    // En az iki büyük harf aranır; "Geçici md. 1" gibi sözcükler kısaltma sayılmaz.
    for (const m of text.matchAll(new RegExp(`(?<![${WORD}])([${UPPER}]{2,5}[a-zçğıöşü]?)(?=\\s+(?:md\\.|m\\.)\\s*\\d)`, "gu"))) {
        if (!mentions.some((x) => x.index === m.index)) add(m.index!, m[0].length, null, m[1]);
    }

    // Aynı yerde birden fazla eşleşme varsa (ör. "Türk Borçlar Kanunu" ve "Borçlar Kanunu") en uzunu kalsın.
    mentions.sort((a, b) => a.index - b.index || b.end - a.end);
    return mentions.filter((m, i) => !mentions.slice(0, i).some((p) => p.index <= m.index && p.end >= m.end));
}

export function extractStatuteCitations(text: string): RawCitation[] {
    const mentions = findLawMentions(text);
    const out: RawCitation[] = [];
    for (let i = 0; i < mentions.length; i++) {
        const mention = mentions[i];
        // Kanun adından sonra, bir sonraki kanun anılmadan önceki en fazla 80 karakter.
        let windowEnd = mention.end + 80;
        // "4721 sayılı Türk Medeni Kanunu" gibi aynı kanunun art arda anılması pencereyi kesmesin.
        let next = i + 1;
        while (next < mentions.length && mentions[next].lawNo === mention.lawNo && mentions[next].label === mention.label && mentions[next].index - mention.end < 40) next++;
        if (next < mentions.length) windowEnd = Math.min(windowEnd, mentions[next].index);
        const after = text.slice(mentions[next - 1].end, windowEnd);

        const m = after.match(ART_PREFIX) ?? after.match(ART_SUFFIX);
        if (!m) continue;
        for (const madde of splitNumbers(m[2], m[1])) {
            out.push({ lawNo: mention.lawNo, lawLabel: mention.label, madde });
        }
        i = next - 1;
    }
    const seen = new Set<string>();
    return out.filter((c) => {
        const key = `${c.lawNo ?? c.lawLabel}|${c.madde}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

function formatLabel(lawLabel: string, madde: string): string {
    const m = madde.match(/^(Geçici|Ek) (.+)$/);
    return m ? `${lawLabel} ${m[1]} md. ${m[2]}` : `${lawLabel} md. ${madde}`;
}

/**
 * `retrievedKeys`: sohbette kanun aramasıyla modele gösterilmiş maddeler, "kanun_no|madde_no" biçiminde.
 */
export async function checkStatuteCitations(
    text: string,
    retrievedKeys: Set<string>,
    db: Db,
): Promise<StatuteCitation[]> {
    const raw = extractStatuteCitations(text);
    if (raw.length === 0) return [];

    const toLookup = raw.filter((c) => c.lawNo && !retrievedKeys.has(`${c.lawNo}|${c.madde}`));
    const existing = new Set<string>();
    const byLaw = new Map<string, string[]>();
    for (const c of toLookup) byLaw.set(c.lawNo!, [...(byLaw.get(c.lawNo!) ?? []), c.madde]);
    for (const [lawNo, maddeler] of byLaw) {
        const { data, error } = await db
            .from("kanun_maddeleri")
            .select("madde_no")
            .eq("kanun_no", lawNo)
            .in("madde_no", maddeler);
        if (error) throw new Error(error.message);
        for (const r of (data ?? []) as { madde_no: string }[]) existing.add(`${lawNo}|${r.madde_no}`);
    }

    return raw.map((c) => {
        const key = `${c.lawNo}|${c.madde}`;
        const status: StatuteCitationStatus = !c.lawNo
            ? "kapsam_disi"
            : retrievedKeys.has(key)
              ? "dogrulandi"
              : existing.has(key)
                ? "okunmadi"
                : "bulunamadi";
        return { label: formatLabel(c.lawLabel, c.madde), kanun_no: c.lawNo, madde_no: c.madde, status };
    });
}
