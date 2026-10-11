import type { ResourceAccessScope } from "./types";
import { t } from "@/shared/i18n";

interface AccessScopeLabelProps {
  scope?: ResourceAccessScope;
  organizationName?: string | null;
  directGrantCount?: number;
}

const ACCESS_SCOPE_DETAILS = {
  private: { label: t("Private") },
  shared: { label: t("Shared") },
  organization: { label: t("Organisation") },
} as const;

export function AccessScopeLabel({
  scope = "private",
  organizationName,
  directGrantCount,
}: AccessScopeLabelProps) {
  const detail = ACCESS_SCOPE_DETAILS[scope];
  const hasDirectGrantCount =
    scope === "shared" &&
    typeof directGrantCount === "number" &&
    Number.isInteger(directGrantCount) &&
    directGrantCount >= 0;
  const accessUserCount = hasDirectGrantCount ? directGrantCount + 1 : null;
  const label =
    scope === "organization" && organizationName
      ? organizationName
      : hasDirectGrantCount
        ? t.plural(accessUserCount ?? 0, "{count} user", "{count} users")
        : detail.label;
  const description =
    scope === "organization"
      ? organizationName
        ? t("Shared with {organization}", { organization: organizationName })
        : t("Shared with an organisation")
      : hasDirectGrantCount
        ? t.plural(accessUserCount ?? 0, "Shared with {count} user", "Shared with {count} users")
        : detail.label;

  return (
    <span
      aria-label={description}
      className="inline-flex min-w-0 items-center text-xs text-gray-600"
      title={description}
    >
      <span className="truncate">{label}</span>
    </span>
  );
}
