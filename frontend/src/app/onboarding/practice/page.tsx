"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { OnboardingShell } from "@/app/components/auth/OnboardingShell";
import {
    PersonalisationFields,
    personalisationInitialValues,
    usePersonalisationFields,
} from "@/app/components/settings/PersonalisationFields";
import { PillButtonUI } from "@/shared/ui/PillButtonUI";
import { ToggleSwitchUI } from "@/shared/ui/ToggleSwitchUI";
import { setUserMemoryEnabled } from "@/app/lib/mikeApi";
import { FullScreenLoader } from "@/app/components/shared/FullScreenLoader";
import { useAuth } from "@/app/contexts/AuthContext";
import { useUserProfile } from "@/app/contexts/UserProfileContext";
import { t } from "@/shared/i18n";

export default function OnboardingPracticePage() {
    const router = useRouter();
    const { user, authLoading } = useAuth();
    const { profile, loading } = useUserProfile();

    useEffect(() => {
        if (!authLoading && !user) router.replace("/login");
    }, [authLoading, router, user]);

    if (authLoading || loading || !user || !profile) {
        return <FullScreenLoader />;
    }

    return (
        <PracticeDetailsForm
            key={user.id}
            initial={personalisationInitialValues(profile)}
        />
    );
}

function PracticeDetailsForm({
    initial,
}: {
    initial: ReturnType<typeof personalisationInitialValues>;
}) {
    const router = useRouter();
    const { completeOnboarding, updateProjectMemoryDefault } = useUserProfile();
    const form = usePersonalisationFields(initial);
    // mikeTR: memory starts on, but every new account is asked about it here,
    // on first use, before the assistant can remember anything.
    const [memoryEnabled, setMemoryEnabled] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const finishOnboarding = async (
        details: Parameters<typeof completeOnboarding>[0],
    ) => {
        setSubmitting(true);
        setError(null);
        if (!memoryEnabled) {
            // Turn memory off before onboarding completes, so a failure here
            // never leaves the account with memory on against the user's choice.
            try {
                await setUserMemoryEnabled(false);
                await updateProjectMemoryDefault(false);
            } catch {
                setError(t("Unable to turn off memory. Please try again."));
                setSubmitting(false);
                return;
            }
        }
        const saved = await completeOnboarding(details);
        if (saved) {
            router.replace("/assistant");
        } else {
            setError(t("Unable to save your practice details"));
            setSubmitting(false);
        }
    };

    const handleSubmit = async (event: React.FormEvent) => {
        event.preventDefault();
        if (form.validationError) {
            setError(form.validationError);
            return;
        }

        await finishOnboarding({
            ...(form.details.jurisdiction
                ? { jurisdiction: form.details.jurisdiction }
                : {}),
            ...(form.details.practiceSetting
                ? { practiceSetting: form.details.practiceSetting }
                : {}),
            ...(form.details.professionalTitle
                ? { professionalTitle: form.details.professionalTitle }
                : {}),
            ...(form.details.practiceAreas?.length
                ? { practiceAreas: form.details.practiceAreas }
                : {}),
        });
    };

    return (
        <OnboardingShell
            step="Step 2 of 2"
            title={t("Your legal practice")}
            description={t("Optionally add your professional setting, primary jurisdiction, and the areas you work in.")}
        >
            <form onSubmit={handleSubmit}>
                <PersonalisationFields
                    form={form}
                    order={[
                        "jurisdiction",
                        "professionalTitle",
                        "practiceSetting",
                        "practiceAreas",
                    ]}
                    className="space-y-4"
                />

                <div className="mt-6 rounded-lg border border-gray-200 p-4">
                    <ToggleSwitchUI
                        checked={memoryEnabled}
                        disabled={submitting}
                        aria-label={t("Assistant memory")}
                        onCheckedChange={setMemoryEnabled}
                        className="font-medium text-gray-900"
                    >
                        {t("Assistant memory")}
                    </ToggleSwitchUI>
                    <p className="mt-2 text-xs text-gray-500">
                        {t("When on, the assistant remembers useful details from your saved conversations, which may include client information, and uses them in later answers. You can review, delete, or turn it off at any time in Settings > Memory.")}
                    </p>
                </div>

                {error && (
                    <div
                        className="mt-4 rounded bg-red-50 p-3 text-sm text-red-600"
                        role="alert"
                    >
                        {error}
                    </div>
                )}

                <div className="flex items-center justify-between gap-3 pt-6">
                    <PillButtonUI
                        type="button"
                        tone="white"
                        size="normal"
                        disabled={submitting}
                        onClick={() => router.push("/onboarding/profile")}
                    >
                        {t("Back")}
                    </PillButtonUI>
                    <div className="flex items-center gap-4">
                        <button
                            type="button"
                            disabled={submitting}
                            onClick={() => void finishOnboarding({})}
                            className="text-sm font-medium text-gray-500 transition-colors hover:text-gray-950 disabled:cursor-not-allowed disabled:text-gray-300"
                        >
                            {t("Skip")}
                        </button>
                        <PillButtonUI
                            type="submit"
                            tone="black"
                            size="normal"
                            disabled={submitting}
                        >
                            {submitting ? "Finishing..." : "Finish"}
                        </PillButtonUI>
                    </div>
                </div>
            </form>
        </OnboardingShell>
    );
}
