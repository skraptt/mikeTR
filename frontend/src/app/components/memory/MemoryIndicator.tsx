"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { BookMarked } from "lucide-react";
import { getUserMemory } from "@/app/lib/mikeApi";
import { t } from "@/shared/i18n";

/**
 * mikeTR: a visible cue that app-wide memory is on, so a lawyer always knows
 * the assistant may remember details (possibly client data) from saved
 * conversations. Links to the memory settings, where it can be reviewed,
 * edited, wiped, or turned off. Renders nothing while loading, on error, or
 * when memory is off.
 */
export function MemoryIndicator({ className }: { className?: string }) {
    const [enabled, setEnabled] = useState(false);

    useEffect(() => {
        const controller = new AbortController();
        // Started inside a promise so any failure, even a synchronous one,
        // only hides the cue and never breaks the chat around it.
        Promise.resolve()
            .then(() => getUserMemory(controller.signal))
            .then((memory) => {
                if (!controller.signal.aborted) setEnabled(memory.enabled === true);
            })
            .catch(() => {
                if (!controller.signal.aborted) setEnabled(false);
            });
        return () => controller.abort();
    }, []);

    if (!enabled) return null;

    return (
        <Link
            href="/settings/memory"
            title={t("The assistant may use details remembered from your saved conversations. Click to review or turn off.")}
            className={`inline-flex items-center gap-1 rounded-full border border-gray-200 px-2 py-0.5 text-xs text-gray-600 hover:border-gray-300 hover:text-gray-900 ${className ?? ""}`}
        >
            <BookMarked aria-hidden="true" className="h-3 w-3" />
            {t("Memory on")}
        </Link>
    );
}
