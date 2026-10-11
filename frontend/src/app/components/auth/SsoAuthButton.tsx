"use client";

import { Globe } from "lucide-react";
import { useRouter } from "next/navigation";
import { PillButtonUI } from "@/shared/ui/PillButtonUI";
import { t } from "@/shared/i18n";

interface SsoAuthButtonProps {
    disabled?: boolean;
}

export function SsoAuthButton({ disabled = false }: SsoAuthButtonProps) {
    const router = useRouter();

    return (
        <PillButtonUI
            type="button"
            tone="white"
            size="normal"
            className="w-full"
            disabled={disabled}
            onClick={() => router.push("/login/sso")}
        >
            <Globe aria-hidden="true" className="h-4 w-4" />
            {t("Continue with SSO")}
        </PillButtonUI>
    );
}
