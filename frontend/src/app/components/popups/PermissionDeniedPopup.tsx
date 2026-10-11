"use client";

import { Lock } from "lucide-react";
import { WarningPopup } from "../popups/WarningPopup";
import { t } from "@/shared/i18n";
import { withNodes } from "@/shared/i18n/react";
import type { ProjectRole } from "@/app/lib/permissions";

/** Anyone the user could ask for access, as the API returns them. */
export interface AccessContact {
    email?: string | null;
    display_name?: string | null;
}

interface Props {
    open: boolean;
    onClose: () => void;
    /** Short headline above the body. Defaults from `requiredRole`. */
    title?: string;
    /** Sentence describing what the user tried to do. */
    action?: string;
    /**
     * The lowest role that may perform the action. "admin" covers settings,
     * sharing and deletion; "member" covers everything a viewer may not do.
     */
    requiredRole?: Extract<ProjectRole, "owner" | "editor">;
    /**
     * People who can grant the access, in the order the server ranked them
     * (creator first, then direct admins, then the organization's admins).
     * The first one with an address is offered.
     */
    contacts?: AccessContact[] | null;
    /** Override the default message entirely. */
    message?: string;
}

const ROLE_SUBJECT: Record<
    NonNullable<Props["requiredRole"]>,
    { title: string; subject: string }
> = {
    owner: { title: t("Owner-only action"), subject: "an owner" },
    editor: { title: t("Editors only"), subject: "an editor" },
};

/**
 * "Only an owner can <action>.", translated as a whole sentence: each locale
 * lists the refusals it knows, keyed by the English sentence, and an action
 * it does not know gets the generic refusal instead of a mixed-language one.
 */
function refusalMessage(subject: string, action?: string): string {
    const english = action
        ? `Only ${subject} can ${action}.`
        : `Only ${subject} can perform this action.`;
    if (t.locale === "en") return english;
    const translated = t(english);
    if (translated !== english) return translated;
    return subject === "an owner"
        ? t("Only an owner can perform this action.")
        : t("Only an editor can perform this action.");
}

/**
 * Fold several rows' contact lists into one, keeping the server's ranking
 * (creator, then direct admins, then organization admins) and dropping
 * repeats. A bulk action refused across several rows still has to name one
 * person, and the same admin usually appears on all of them.
 */
export function mergeAccessContacts(
    lists: (AccessContact[] | null | undefined)[],
): AccessContact[] {
    const seen = new Set<string>();
    const merged: AccessContact[] = [];
    for (const list of lists) {
        for (const contact of list ?? []) {
            const key = contact.email?.trim().toLowerCase();
            if (!key || seen.has(key)) continue;
            seen.add(key);
            merged.push(contact);
        }
    }
    return merged;
}

/** The first contact with an address, rendered as a name plus its email. */
function pickContact(contacts: AccessContact[] | null | undefined) {
    for (const contact of contacts ?? []) {
        const email = contact.email?.trim();
        if (!email) continue;
        const name = contact.display_name?.trim();
        return { email, name: name || null };
    }
    return null;
}

/**
 * "You don't have permission" popup, shown when the caller's role does not
 * allow an action (change sharing, rename, delete, …), instead of letting the
 * server's silent 403/404 look like a bug.
 *
 * The contact line is the point of the component. A refusal that cannot say
 * who to ask is a dead end — which is exactly what shipped before: the popup
 * guarded its email line on a field the project endpoint never returned, so
 * the line could never render. It now takes the server's ranked admin
 * contacts, so an organization member refused on a colleague's project sees a
 * real person to ask.
 */
export function PermissionDeniedPopup({
    open,
    onClose,
    title,
    action,
    requiredRole = "owner",
    contacts,
    message,
}: Props) {
    if (!open) return null;

    const subject = ROLE_SUBJECT[requiredRole];
    const heading = title ?? subject.title;
    const body = message ?? refusalMessage(subject.subject, action);
    const contact = pickContact(contacts);

    return (
        <WarningPopup
            open={open}
            onClose={onClose}
            title={heading}
            message={body}
            icon={<Lock className="h-3.5 w-3.5 shrink-0 text-red-600" />}
        >
            {contact && (
                <p className="mt-1 text-xs text-gray-600">
                    {withNodes(
                        requiredRole === "owner"
                            ? t("Ask {contact} if you need owner access.")
                            : t("Ask {contact} if you need editor access."),
                        {
                            contact: (
                                <span className="text-gray-600">
                                    {contact.name
                                        ? `${contact.name} (${contact.email})`
                                        : contact.email}
                                </span>
                            ),
                        },
                    )}
                </p>
            )}
        </WarningPopup>
    );
}
