"use client";

import { useRouter } from "next/navigation";
import { AlertTriangle } from "lucide-react";
import {
    NO_MODELS_MESSAGES,
    type NoModelsReason,
} from "@/shared/lib/modelCatalog";
import { WarningPopup } from "./WarningPopup";
import { t } from "@/shared/i18n";

export function NoModelsWarningPopup({
    reason,
    onClose,
}: {
    reason: NoModelsReason | null;
    onClose: () => void;
}) {
    if (!reason) return null;

    return <VisibleNoModelsWarning reason={reason} onClose={onClose} />;
}

function VisibleNoModelsWarning({
    reason,
    onClose,
}: {
    reason: NoModelsReason;
    onClose: () => void;
}) {
    const router = useRouter();

    return (
        <WarningPopup
            open
            onClose={onClose}
            title={t("No models available")}
            message={t(NO_MODELS_MESSAGES[reason])}
            icon={
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-600" />
            }
            primaryAction={{
                label: t("Open Bring Your Own Keys"),
                onClick: () => {
                    onClose();
                    router.push("/settings/byok");
                },
            }}
        />
    );
}
