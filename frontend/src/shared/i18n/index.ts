// Minimal message-as-key i18n.
//
// UI code wraps its English text in t(): `t("How can I help?")`. The English
// string is both the key and the fallback, so an untranslated message still
// renders, and components can be converted one at a time. Other locales map
// the English text to a translation in `locales/<code>.ts`.
//
// Placeholders use `{name}`: t("{count} results", { count: 3 }).
//
// The active locale comes from NEXT_PUBLIC_DEFAULT_LOCALE (default "en"), so
// English behaviour — and every test asserting English text — is unchanged
// unless a deployment opts in. This module is framework-light so the Word
// add-in can use it too; React bindings live in ./react.tsx.
import { tr } from "./locales/tr";

export type Locale = "en" | "tr";

export type MessageParams = Record<string, string | number>;

const DICTIONARIES: Record<Locale, Readonly<Record<string, string>>> = {
    en: {},
    tr,
};

export const SUPPORTED_LOCALES = Object.keys(DICTIONARIES) as Locale[];

export function isLocale(value: unknown): value is Locale {
    return typeof value === "string" && value in DICTIONARIES;
}

// Next.js inlines NEXT_PUBLIC_* at build time; the Word add-in's webpack does
// not define `process`, so the guard keeps that bundle on English.
const configuredLocale: unknown =
    typeof process !== "undefined" ? process.env.NEXT_PUBLIC_DEFAULT_LOCALE : undefined;

export const DEFAULT_LOCALE: Locale = isLocale(configuredLocale) ? configuredLocale : "en";

function interpolate(message: string, params?: MessageParams): string {
    if (!params) return message;
    return message.replace(/\{(\w+)\}/g, (whole, name: string) =>
        name in params ? String(params[name]) : whole,
    );
}

export function translate(
    locale: Locale,
    message: string,
    params?: MessageParams,
): string {
    return interpolate(DICTIONARIES[locale][message] ?? message, params);
}

/**
 * Chooses the English singular or plural form by count, then translates it.
 * Locales without plural nouns (Turkish) map both forms to one translation.
 */
export function translatePlural(
    locale: Locale,
    count: number,
    one: string,
    other: string,
    params?: MessageParams,
): string {
    return translate(locale, count === 1 ? one : other, { count, ...params });
}

export type Translator = {
    (message: string, params?: MessageParams): string;
    plural: (count: number, one: string, other: string, params?: MessageParams) => string;
    locale: Locale;
};

export function createTranslator(locale: Locale): Translator {
    const t = ((message: string, params?: MessageParams) =>
        translate(locale, message, params)) as Translator;
    t.plural = (count, one, other, params) =>
        translatePlural(locale, count, one, other, params);
    t.locale = locale;
    return t;
}

/** Translator for the deployment's default locale; usable outside React. */
export const t = createTranslator(DEFAULT_LOCALE);
