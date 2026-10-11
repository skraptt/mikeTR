"use client";

import type { Workflow } from "../shared/types";
import { WorkflowPickerModal } from "../workflows/WorkflowPickerModal";
import { t } from "@/shared/i18n";

interface Props {
    open: boolean;
    onClose: () => void;
    onSelect: (workflow: Workflow) => Promise<void> | void;
    projectName?: string;
    projectCmNumber?: string | null;
    initialWorkflowId?: string;
}

export function AssistantWorkflowModal({
    open,
    onClose,
    onSelect,
    projectName,
    projectCmNumber,
    initialWorkflowId,
}: Props) {
    const breadcrumbs = projectName
        ? [
              "Projects",
              `${projectName}${projectCmNumber ? ` (#${projectCmNumber})` : ""}`,
              t("Assistant"),
              t("Add workflow"),
          ]
        : [t("Assistant"), t("Add workflow")];

    return (
        <WorkflowPickerModal
            open={open}
            onClose={onClose}
            onSelect={onSelect}
            workflowType="assistant"
            breadcrumbs={breadcrumbs}
            primaryLabel="Use"
            initialWorkflowId={initialWorkflowId}
        />
    );
}
