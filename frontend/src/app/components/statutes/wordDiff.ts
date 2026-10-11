// Word-level diff for showing what changed in a statute article.

export type DiffPart = { text: string; kind: "same" | "added" | "removed" };

// Above this many words on a side the quadratic table gets slow; the texts
// are then shown without highlighting.
const MAX_WORDS = 2500;

function tokens(text: string): string[] {
    return text.split(/(\s+)/).filter(Boolean);
}

/** Parts of the old and new text, in order, marked same / removed / added. */
export function wordDiff(oldText: string, newText: string): DiffPart[] | null {
    const a = tokens(oldText);
    const b = tokens(newText);
    if (a.length > MAX_WORDS || b.length > MAX_WORDS) return null;

    // lcs[i][j] = length of the longest common subsequence of a[i..] and b[j..]
    const lcs: Uint16Array[] = Array.from({ length: a.length + 1 }, () => new Uint16Array(b.length + 1));
    for (let i = a.length - 1; i >= 0; i--) {
        for (let j = b.length - 1; j >= 0; j--) {
            lcs[i][j] = a[i] === b[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
        }
    }

    const parts: DiffPart[] = [];
    const push = (text: string, kind: DiffPart["kind"]) => {
        const last = parts[parts.length - 1];
        if (last?.kind === kind) last.text += text;
        else parts.push({ text, kind });
    };
    let i = 0;
    let j = 0;
    while (i < a.length && j < b.length) {
        if (a[i] === b[j]) {
            push(a[i], "same");
            i++;
            j++;
        } else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
            push(a[i++], "removed");
        } else {
            push(b[j++], "added");
        }
    }
    while (i < a.length) push(a[i++], "removed");
    while (j < b.length) push(b[j++], "added");
    return parts;
}
