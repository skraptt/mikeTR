// mikeTR: the terms and privacy notice shown at sign-up must name whoever
// actually runs this install (the controller), not the upstream Mike project.
// A self-hosting firm sets NEXT_PUBLIC_TERMS_URL / NEXT_PUBLIC_PRIVACY_URL to
// its own documents; otherwise the mikeTR templates in docs/ are shown.
// Next inlines NEXT_PUBLIC_* at build time; reading them in a function keeps
// them stubbable in tests.

const REPO_DOCS = "https://github.com/skraptt/mikeTR/blob/main/docs";

export const DEFAULT_TERMS_URL = `${REPO_DOCS}/kullanim-kosullari.md`;
export const DEFAULT_PRIVACY_URL = `${REPO_DOCS}/gizlilik.md`;

export function termsUrl(): string {
    return process.env.NEXT_PUBLIC_TERMS_URL?.trim() || DEFAULT_TERMS_URL;
}

export function privacyUrl(): string {
    return process.env.NEXT_PUBLIC_PRIVACY_URL?.trim() || DEFAULT_PRIVACY_URL;
}
