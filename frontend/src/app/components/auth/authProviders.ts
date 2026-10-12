// mikeTR: Google and SSO sign-in only work once the provider is set up
// (docs/deployment.md), which a fresh install has not done, so their buttons
// stay hidden unless the build switches them on. Next inlines NEXT_PUBLIC_*
// at build time; reading them in a function keeps them stubbable in tests.

export function googleLoginEnabled(): boolean {
    return process.env.NEXT_PUBLIC_GOOGLE_LOGIN === "true";
}

export function ssoLoginEnabled(): boolean {
    return process.env.NEXT_PUBLIC_SSO_LOGIN === "true";
}
