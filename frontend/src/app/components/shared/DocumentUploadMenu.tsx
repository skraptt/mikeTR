"use client";

import { Files, FolderUp, Upload } from "lucide-react";
import {
    Dropdown,
    DropdownContent,
    DropdownItem,
    DropdownTrigger,
} from "@/shared/ui/dropdown";
import { HeaderButtonUI } from "@/shared/ui/HeaderButtonsUI";
import { t } from "@/shared/i18n";

interface DocumentUploadMenuProps {
    onSavedFiles?: (() => void) | null;
    onUploadFiles: (() => void) | null;
    onUploadFolder?: (() => void) | null;
    disabled?: boolean;
}

export function DocumentUploadMenu({
    onSavedFiles,
    onUploadFiles,
    onUploadFolder,
    disabled = false,
}: DocumentUploadMenuProps) {
    const triggerDisabled =
        disabled || (!onSavedFiles && !onUploadFiles && !onUploadFolder);

    return (
        <Dropdown>
            <DropdownTrigger asChild>
                <HeaderButtonUI
                    disabled={triggerDisabled}
                    title={t("Upload")}
                    aria-label={t("Upload")}
                    iconOnly
                >
                    <Upload className="h-3.5 w-3.5" />
                </HeaderButtonUI>
            </DropdownTrigger>
            <DropdownContent
                align="end"
                className="min-w-40 p-1"
            >
                {onSavedFiles !== undefined && (
                    <DropdownItem
                        disabled={disabled || !onSavedFiles}
                        onSelect={() => onSavedFiles?.()}
                        className="flex items-center px-3 py-2"
                    >
                        <Files className="mr-2 h-3.5 w-3.5" />
                        {t("Saved Documents")}
                    </DropdownItem>
                )}
                <DropdownItem
                    disabled={disabled || !onUploadFiles}
                    onSelect={() => onUploadFiles?.()}
                    className="flex items-center px-3 py-2"
                >
                    <Upload className="mr-2 h-3.5 w-3.5" />
                    {t("Upload Documents")}
                </DropdownItem>
                {onUploadFolder !== undefined && (
                    <DropdownItem
                        disabled={disabled || !onUploadFolder}
                        onSelect={() => onUploadFolder?.()}
                        className="flex items-center px-3 py-2"
                    >
                        <FolderUp className="mr-2 h-3.5 w-3.5" />
                        {t("Upload folder")}
                    </DropdownItem>
                )}
            </DropdownContent>
        </Dropdown>
    );
}
