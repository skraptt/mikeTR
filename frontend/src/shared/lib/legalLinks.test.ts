import { afterEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_PRIVACY_URL, DEFAULT_TERMS_URL, privacyUrl, termsUrl } from "./legalLinks";

describe("legalLinks", () => {
    afterEach(() => {
        vi.unstubAllEnvs();
    });

    it("defaults to mikeTR's own documents, never mikeoss.com", () => {
        vi.stubEnv("NEXT_PUBLIC_TERMS_URL", "");
        vi.stubEnv("NEXT_PUBLIC_PRIVACY_URL", "");
        expect(termsUrl()).toBe(DEFAULT_TERMS_URL);
        expect(privacyUrl()).toBe(DEFAULT_PRIVACY_URL);
        expect(termsUrl()).not.toContain("mikeoss.com");
        expect(privacyUrl()).not.toContain("mikeoss.com");
    });

    it("uses the operator's own URLs when set", () => {
        vi.stubEnv("NEXT_PUBLIC_TERMS_URL", " https://buro.example/kosullar ");
        vi.stubEnv("NEXT_PUBLIC_PRIVACY_URL", "https://buro.example/aydinlatma");
        expect(termsUrl()).toBe("https://buro.example/kosullar");
        expect(privacyUrl()).toBe("https://buro.example/aydinlatma");
    });
});
