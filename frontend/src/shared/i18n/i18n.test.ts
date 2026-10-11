import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createTranslator, translate } from "./index";
import { tr } from "./locales/tr";

const SRC_ROOT = path.resolve(__dirname, "../..");
// The API writes 4xx messages for users; the client translates them by text.
const BACKEND_SRC = path.resolve(__dirname, "../../../../backend/src");

function sourceFiles(dir: string): string[] {
    return readdirSync(dir).flatMap((name) => {
        const full = path.join(dir, name);
        if (statSync(full).isDirectory()) {
            return name === "node_modules" || name === "locales" ? [] : sourceFiles(full);
        }
        return /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [full] : [];
    });
}

describe("translate", () => {
    it("returns the English message unchanged for en", () => {
        expect(translate("en", "How can I help?")).toBe("How can I help?");
    });

    it("falls back to English when a translation is missing", () => {
        expect(translate("tr", "A message nobody translated")).toBe("A message nobody translated");
    });

    it("fills placeholders in both languages", () => {
        expect(translate("en", "Hi, {name}", { name: "Ada" })).toBe("Hi, Ada");
        expect(translate("tr", "Hi, {name}", { name: "Ada" })).toBe("Merhaba, Ada");
    });

    it("picks the English plural form by count", () => {
        const en = createTranslator("en");
        expect(en.plural(1, "Completed in {count} step", "Completed in {count} steps")).toBe(
            "Completed in 1 step",
        );
        expect(en.plural(3, "Completed in {count} step", "Completed in {count} steps")).toBe(
            "Completed in 3 steps",
        );
        expect(
            createTranslator("tr").plural(3, "Completed in {count} step", "Completed in {count} steps"),
        ).toBe("3 adımda tamamlandı");
    });
});

describe("tr dictionary", () => {
    const source = [...sourceFiles(SRC_ROOT), ...(existsSync(BACKEND_SRC) ? sourceFiles(BACKEND_SRC) : [])]
        .map((file) => readFileSync(file, "utf8"))
        .join("\n");
    const quoted = (text: string) =>
        source.includes(JSON.stringify(text)) ||
        source.includes(`"${text}"`) ||
        source.includes(`'${text}'`) ||
        source.includes(`\`${text}\``);

    it("only contains keys that appear verbatim in the source", () => {
        // A key that is not in the code is dead or mistyped (wrong casing,
        // missing punctuation) and silently never applies.
        // "Couldn't <action>" titles (couldNotTitle) and "Only an owner can
        // <action>." refusals (PermissionDeniedPopup) are composed in
        // English; the action itself must appear in the source.
        const unused = Object.keys(tr).filter((key) => {
            const action =
                /^Couldn't (.+)$/.exec(key)?.[1] ??
                /^Only an? (?:owner|editor) can (.+)\.$/.exec(key)?.[1];
            return !quoted(key) && !(action !== undefined && quoted(action));
        });
        expect(unused).toEqual([]);
    });

    it("keeps every placeholder of the English message", () => {
        const broken = Object.entries(tr).filter(([key, value]) =>
            (key.match(/\{\w+\}/g) ?? []).some((placeholder) => !value.includes(placeholder)),
        );
        expect(broken).toEqual([]);
    });
});
