"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { signup } from "@/app/lib/authApi";
import { InputUI } from "@/shared/ui/InputUI";
import { PillButtonUI } from "@/shared/ui/PillButtonUI";
import { pillButtonUIClassName } from "@/shared/ui/PillButtonUI.styles";
import Link from "next/link";
import { SiteLogo } from "@/app/components/site-logo";
import { useAuth } from "@/app/contexts/AuthContext";
import { cn } from "@/app/lib/utils";
import {
    authGlassCardUIClassName,
    authInputUIClassName,
} from "@/shared/ui/AuthStylesUI";
import {
    UserVisibleError,
    describeError,
    supportMailtoFor,
    type UserFacingError,
} from "@/app/lib/userFacingError";
import { t } from "@/shared/i18n";
import { withNodes } from "@/shared/i18n/react";


/** A failure the form found itself, so the text is already user-facing. */
function localSignupError(message: string): UserFacingError {
    return describeError(
        new UserVisibleError(message, { kind: "validation" }),
        { action: "create your account" },
    );
}

/**
 * The shared auth table with this screen's deltas. Anything not listed
 * falls through to `describeError` so a 429, a 5xx, or a dropped connection
 * still says what actually happened.
 */
const SIGNUP_ERROR_MESSAGES = authMessages({
    validation_failed: t("Check your email address and password and try again."),
    invalid_request: t("Check your email address and password and try again."),
    over_email_send_rate_limit:
        t("Too many signup emails have been requested. Wait a few minutes and try again."),
    request_timeout: t("The signup request timed out. Try again."),
});

/** Classify a signup failure into text a person can act on. */
function describeSignupError(error: unknown): UserFacingError {
    const described = describeError(error, {
        action: "create your account",
        codeMessages: SIGNUP_ERROR_MESSAGES,
        fallback: t("Unable to create your account right now. Try again."),
    });
    return described.kind === "rate_limited"
        ? { ...described, message: TOO_MANY_ATTEMPTS_MESSAGE }
        : described;
}
import {
    MIN_PASSWORD_LENGTH,
    isPasswordTooLong,
    maximumPasswordMessage,
    minimumPasswordMessage,
} from "@/app/components/auth/passwordPolicy";
import { TOO_MANY_ATTEMPTS_MESSAGE, authMessages } from "@/app/lib/authMessages";
import { AuthDividerUI } from "@/shared/ui/AuthDividerUI";
import { GoogleAuthButton } from "@/app/components/auth/GoogleAuthButton";
import { googleLoginEnabled } from "@/app/components/auth/authProviders";
import { privacyUrl, termsUrl } from "@/shared/lib/legalLinks";
import { FieldLabel } from "@/app/components/ui/form-field";

function SignupContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const { isAuthenticated, authLoading, refreshSession } = useAuth();
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<UserFacingError | null>(null);
    const [success, setSuccess] = useState(false);
    const isAccountCreatedPreview =
        process.env.NODE_ENV !== "production" &&
        searchParams.get("preview") === "account-created";

    useEffect(() => {
        if (isAccountCreatedPreview) return;
        if (!authLoading && isAuthenticated && !success) {
            router.replace("/onboarding/profile");
        }
    }, [
        authLoading,
        isAccountCreatedPreview,
        isAuthenticated,
        router,
        success,
    ]);

    const handleSignup = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError(null);

        // Validate passwords match
        if (password !== confirmPassword) {
            setError(localSignupError(t("The two passwords don't match.")));
            setLoading(false);
            return;
        }

        // Validate password length. The upper bound is bcrypt's 72 BYTES:
        // GoTrue rejects anything longer, so say so before the round trip.
        if (password.length < MIN_PASSWORD_LENGTH) {
            setError(localSignupError(`${minimumPasswordMessage}.`));
            setLoading(false);
            return;
        }
        if (isPasswordTooLong(password)) {
            setError(localSignupError(maximumPasswordMessage));
            setLoading(false);
            return;
        }

        try {
            const trimmedEmail = email.trim();
            const result = await signup(
                trimmedEmail,
                password,
                "/onboarding/profile",
            );

            if (!result.requiresEmailConfirmation) {
                await refreshSession();
                setSuccess(true);
                setTimeout(() => {
                    router.push("/onboarding/profile");
                }, 2000);
            } else {
                router.push("/signup/check-email");
            }
        } catch (caught: unknown) {
            setError(describeSignupError(caught));
        } finally {
            setLoading(false);
        }
    };

    // Success View
    if (success || isAccountCreatedPreview) {
        return (
            <div className="relative flex min-h-dvh items-center justify-center bg-gray-50/80 px-6 py-10">
                <div className="absolute top-4 md:top-8 left-1/2 -translate-x-1/2">
                    <SiteLogo size="lg" asLink />
                </div>
                <div className="w-full max-w-md">
                    <div className={authGlassCardUIClassName}>
                        <h1 className="font-serif text-2xl font-medium text-gray-950">
                            {t("Account created!")}
                        </h1>
                        <p className="mt-3 text-sm leading-relaxed text-gray-600">
                            {t("Redirecting you to finish setting up your account...")}
                        </p>
                        <Link
                            href="/onboarding/profile"
                            className={pillButtonUIClassName({
                                tone: "black",
                                size: "normal",
                                className: "mt-6",
                            })}
                        >
                            {t("Continue")}
                        </Link>
                    </div>
                </div>
            </div>
        );
    }

    // Default Signup Form View
    return (
        <div className="relative flex min-h-dvh items-center justify-center bg-gray-50/80 px-6 py-24">
            <div className="absolute top-4 md:top-8 left-1/2 -translate-x-1/2">
                <SiteLogo size="lg" asLink />
            </div>
            <div className="w-full max-w-md">
                <div className={cn(authGlassCardUIClassName, "mb-4")}>
                    <h2 className="mb-6 text-left text-2xl font-medium font-serif text-gray-950">
                        {t("Sign Up")}
                    </h2>

                    <form onSubmit={handleSignup} className="space-y-4">
                        <div>
                            <FieldLabel htmlFor="email">
                                {t("Email")}
                            </FieldLabel>
                            <InputUI
                                id="email"
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                required
                                className={`w-full ${authInputUIClassName}`}
                            />
                        </div>

                        <div>
                            <FieldLabel htmlFor="password">
                                {t("Password")}
                            </FieldLabel>
                            <InputUI
                                id="password"
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                placeholder={t("Min. {count} Characters", { count: MIN_PASSWORD_LENGTH })}
                                required
                                className={`w-full ${authInputUIClassName}`}
                            />
                        </div>

                        <div>
                            <FieldLabel htmlFor="confirmPassword">
                                {t("Confirm Password")}
                            </FieldLabel>
                            <InputUI
                                id="confirmPassword"
                                type="password"
                                value={confirmPassword}
                                onChange={(e) =>
                                    setConfirmPassword(e.target.value)
                                }
                                required
                                className={`w-full ${authInputUIClassName}`}
                            />
                        </div>

                        {error && (
                            <div
                                role="alert"
                                className="text-red-600 text-sm bg-red-50 p-3 rounded"
                            >
                                {error.message}
                                {error.supportable && (
                                    <a
                                        href={supportMailtoFor(
                                            error,
                                            t("Failed to create an account."),
                                        )}
                                        className="ml-2 underline underline-offset-2"
                                    >
                                        {t("Contact support")}
                                    </a>
                                )}
                            </div>
                        )}

                        <div className="space-y-3 pt-2">
                            <div className="text-center text-xs text-gray-500">
                                {withNodes(t("By signing up, you agree to our {terms} and {privacy}"), {
                                    terms: (
                                        <Link
                                            href={termsUrl()}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="text-blue-600 hover:underline"
                                        >
                                            {t("Terms of Use")}
                                        </Link>
                                    ),
                                    privacy: (
                                        <Link
                                            href={privacyUrl()}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="text-blue-600 hover:underline"
                                        >
                                            {t("Privacy Policy")}
                                        </Link>
                                    ),
                                })}
                            </div>
                            <PillButtonUI
                                type="submit"
                                tone="black"
                                size="normal"
                                disabled={loading}
                                className="w-full"
                            >
                                {loading ? t("Creating account...") : t("Sign up")}
                            </PillButtonUI>
                            {googleLoginEnabled() && (
                                <>
                                    <AuthDividerUI />
                                    <GoogleAuthButton
                                        onError={setError}
                                        disabled={loading}
                                        onLoadingChange={setLoading}
                                    />
                                </>
                            )}
                        </div>
                    </form>
                </div>
                <div className="text-center text-sm text-gray-500">
                    {t("Have an account?")}{" "}
                    <Link
                        href="/login"
                        className="font-medium transition-colors hover:text-gray-950"
                    >
                        {t("Log in")}
                    </Link>
                </div>
            </div>
        </div>
    );
}

export default function SignupPage() {
    return (
        <Suspense fallback={null}>
            <SignupContent />
        </Suspense>
    );
}
