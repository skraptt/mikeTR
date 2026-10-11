"use client";

import { createContext, Fragment, useContext, useMemo, type ReactNode } from "react";
import { createTranslator, DEFAULT_LOCALE, t as defaultTranslator, type Locale, type Translator } from "./index";

const TranslatorContext = createContext<Translator>(defaultTranslator);

/**
 * Optional: overrides the locale for a subtree (for example a per-user
 * language setting). Without it, components use the deployment default.
 */
export function I18nProvider({ locale, children }: { locale: Locale; children: ReactNode }) {
    const translator = useMemo(
        () => (locale === DEFAULT_LOCALE ? defaultTranslator : createTranslator(locale)),
        [locale],
    );
    return <TranslatorContext.Provider value={translator}>{children}</TranslatorContext.Provider>;
}

/** `const t = useT(); t("How can I help?")` */
export function useT(): Translator {
    return useContext(TranslatorContext);
}

/**
 * Fills `{name}` placeholders of an already translated message with React
 * nodes, so a sentence with inline markup is translated as one sentence:
 * `withNodes(t("Delete {file}?"), { file: <strong>{name}</strong> })`.
 */
export function withNodes(message: string, nodes: Record<string, ReactNode>): ReactNode {
    return message.split(/(\{\w+\})/).map((part, index) => {
        const name = /^\{(\w+)\}$/.exec(part)?.[1];
        return (
            <Fragment key={index}>{name !== undefined && name in nodes ? nodes[name] : part}</Fragment>
        );
    });
}
