import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createTranslator, translate } from "./index";
import { tr } from "./locales/tr";

const SRC_ROOT = path.resolve(__dirname, "../..");

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
    const source = sourceFiles(SRC_ROOT)
        .map((file) => readFileSync(file, "utf8"))
        .join("\n");

    it("only contains keys that appear verbatim in the source", () => {
        // A key that is not in the code is dead or mistyped (wrong casing,
        // missing punctuation) and silently never applies.
        const unused = Object.keys(tr).filter(
            (key) =>
                !source.includes(JSON.stringify(key)) &&
                !source.includes(`"${key}"`) &&
                !source.includes(`'${key}'`),
        );
        expect(unused).toEqual([]);
    });

    it("keeps every placeholder of the English message", () => {
        const broken = Object.entries(tr).filter(([key, value]) =>
            (key.match(/\{\w+\}/g) ?? []).some((placeholder) => !value.includes(placeholder)),
        );
        expect(broken).toEqual([]);
    });
});
