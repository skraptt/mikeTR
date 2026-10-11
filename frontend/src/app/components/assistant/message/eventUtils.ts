import type { AssistantEvent } from "../../shared/types";
import { t } from "@/shared/i18n";

export function eventErrorMessage(event: AssistantEvent): string | null {
    if (event.type === "error") {
        return event.safe_to_display
            ? event.message
            : t("Sorry, something went wrong.");
    }
    if ("error" in event && typeof event.error === "string" && event.error) {
        return t("Sorry, something went wrong.");
    }
    return null;
}

/**
 * Label for a connector tool: the connector's own title when it sent one,
 * otherwise its identifier made readable ("get_workspace_teams" becomes
 * "Get workspace teams").
 */
export function connectorToolLabel(
    toolName: string,
    toolTitle?: string | null,
): string {
    const title = toolTitle?.trim();
    if (title) return title;
    const words = toolName.replace(/[_-]+/g, " ").trim();
    return words ? words.charAt(0).toUpperCase() + words.slice(1) : toolName;
}

export function toolCallLabel(name: string): string {
    if (name === "ask_inputs") return t("Asking for input...");
    if (name === "generate_docx") return t("Creating document...");
    if (name === "generate_excel") return t("Creating spreadsheet...");
    if (name === "generate_ppt") return t("Creating presentation...");
    if (name === "edit_document") return t("Editing document...");
    if (name === "read_document") return t("Reading document...");
    if (name === "fetch_documents") return t("Reading documents...");
    if (name === "find_in_document") return t("Searching document...");
    if (name === "replicate_document") return t("Copying document...");
    if (name === "read_workflow") return t("Reading workflow...");
    if (name === "list_workflows") return t("Loading workflows...");
    if (name === "list_documents") return t("Loading documents...");
    if (name === "search_kanun_maddeleri") return t("Searching statutes...");
    if (name === "courtlistener_search_case_law")
        return t("Searching case law...");
    if (name === "courtlistener_get_cases") return t("Fetching cases...");
    if (name === "courtlistener_find_in_case") return t("Searching case...");
    if (name === "courtlistener_read_case") return t("Reading case...");
    if (name === "courtlistener_verify_citations")
        return t("Verifying citations...");
    if (name.startsWith("mcp_")) return t("Using connector...");
    return name ? t("Running {name}...", { name }) : t("Working...");
}
