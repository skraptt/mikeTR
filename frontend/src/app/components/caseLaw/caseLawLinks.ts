// Where a decision opens. Yargıtay decisions have a public page on
// mevzuat.adalet.gov.tr; UYAP Emsal has no page per decision, so those open
// in mikeTR's own reader.

export function decisionReaderHref(decision: { id: string; atif?: string | null }): string {
    const params = new URLSearchParams({ id: decision.id });
    if (decision.atif) params.set("atif", decision.atif);
    return `/case-law/decision?${params.toString()}`;
}

export function decisionHref(decision: { id: string; atif?: string | null; kaynak?: string | null }): string {
    return decision.id.startsWith("yargitay:") && decision.kaynak
        ? decision.kaynak
        : decisionReaderHref(decision);
}
