"use client";

import type { ReactNode } from "react";
import { Modal } from "@/app/components/modals/Modal";
import { ApiKeyField, type ApiKeyFieldSetting } from "./ApiKeyField";
import { RouterSettingsSection } from "./RouterSettingsSection";
import { useUserProfile } from "@/app/contexts/UserProfileContext";
import {
  isVertexServiceAccountKey,
  normalizeAwsRegion,
  normalizeAzureEndpoint,
  normalizeAzureFoundryEndpoint,
  normalizeCustomBaseUrl,
  normalizeVertexLocation,
} from "@/app/lib/cloudProviderSettings";
import type { ApiKeyProvider, ApiKeySettings } from "@/app/lib/mikeApi";
import { isRouterSlug } from "@/shared/lib/modelCatalog";
import { t } from "@/shared/i18n";

export type ByokProvider = {
  provider: ApiKeyProvider;
  name: string;
  label: string;
  /** What the modal calls the secret; defaults to "API key". */
  keyLabel?: string;
};

type SettingsProvider = keyof ApiKeySettings;

const SETTINGS_PROVIDERS: readonly SettingsProvider[] = [
  "bedrock",
  "azure",
  "azure-foundry",
  "vertex",
  "custom",
];

/** The setting each of these keys is saved with. */
function keySetting(
  provider: SettingsProvider,
  settings: ApiKeySettings | undefined,
): ApiKeyFieldSetting {
  if (provider === "bedrock") {
    return {
      label: t("AWS region"),
      placeholder: "us-east-1",
      savedValue: settings?.bedrock?.region ?? null,
      normalize: normalizeAwsRegion,
      invalidMessage:
        t("Enter the AWS region the key was created in, for example us-east-1."),
    };
  }
  if (provider === "azure-foundry") {
    return {
      label: t("Azure AI Foundry resource name or endpoint"),
      placeholder:
        "contoso-foundry or https://contoso-foundry.services.ai.azure.com",
      savedValue: settings?.["azure-foundry"]?.endpoint ?? null,
      normalize: normalizeAzureFoundryEndpoint,
      invalidMessage:
        t("Enter a resource name, or an https endpoint on services.ai.azure.com, cognitiveservices.azure.com or openai.azure.com."),
    };
  }
  if (provider === "vertex") {
    return {
      label: t("Vertex AI location"),
      placeholder: "us-central1 or global",
      savedValue: settings?.vertex?.location ?? null,
      normalize: normalizeVertexLocation,
      invalidMessage:
        t("Enter the Vertex AI location to call, for example us-central1, europe-west4 or global."),
    };
  }
  if (provider === "custom") {
    return {
      label: t("Base URL"),
      placeholder: "https://llm.example.com/v1",
      savedValue: settings?.custom?.baseUrl ?? null,
      normalize: normalizeCustomBaseUrl,
      invalidMessage:
        t("Enter the endpoint's public https base URL, for example https://llm.example.com/v1."),
    };
  }
  return {
    label: t("Azure OpenAI resource name or endpoint"),
    placeholder: "contoso-openai or https://contoso-openai.openai.azure.com",
    savedValue: settings?.azure?.endpoint ?? null,
    normalize: normalizeAzureEndpoint,
    invalidMessage:
      t("Enter a resource name, or an https endpoint on openai.azure.com, cognitiveservices.azure.com or services.ai.azure.com."),
  };
}

function settingsFor(
  provider: SettingsProvider,
  value: string,
): NonNullable<ApiKeySettings[SettingsProvider]> {
  if (provider === "bedrock") return { region: value };
  if (provider === "vertex") return { location: value };
  if (provider === "custom") return { baseUrl: value };
  return { endpoint: value };
}

function validateVertexKey(value: string): string | null {
  return isVertexServiceAccountKey(value)
    ? null
    : t("Paste the full contents of a Google Cloud service-account key file (JSON).");
}

export function ByokProviderModal({ provider, enabledToggle, onClose }: {
  provider: ByokProvider | null;
  /** The provider's on/off switch, shown once a key is saved. */
  enabledToggle?: ReactNode;
  onClose: () => void;
}) {
  const { profile, updateApiKey } = useUserProfile();
  const settingsProvider =
    SETTINGS_PROVIDERS.find((slug) => slug === provider?.provider) ?? null;
  // Routers (and the cloud providers) also keep Model Selections.
  const router =
    provider && isRouterSlug(provider.provider) ? provider.provider : null;

  if (!provider) return null;

  return (
    <ApiKeyField
      key={provider.provider}
      variant="modal"
      label={t(provider.label)}
      hasSavedKey={profile?.apiKeys[provider.provider]?.source === "user"}
      keyLabel={provider.keyLabel && t(provider.keyLabel)}
      validateKey={provider.provider === "vertex" ? validateVertexKey : undefined}
      setting={settingsProvider ? keySetting(settingsProvider, profile?.apiKeySettings) : undefined}
      onSave={(value, settingValue) => updateApiKey(
        provider.provider, value.trim() || null,
        settingsProvider && settingValue ? settingsFor(settingsProvider, settingValue) : undefined,
      )}
      onRemove={async () => {
        const removed = await updateApiKey(provider.provider, null);
        // Nothing is left to manage once the key is gone.
        if (removed) onClose();
        return removed;
      }}
      render={(fields, saveAction, removeAction) => (
        <Modal
          open
          onClose={onClose}
          breadcrumbs={[t("Model Providers"), provider.name]}
          size={router ? "md" : "sm"}
          className="h-auto max-h-[calc(100vh-2rem)]"
          primaryAction={{ ...saveAction, variant: "blue" }}
          secondaryAction={removeAction ? { ...removeAction, label: t("Clear"), variant: "danger" } : undefined}
        >
          <div data-modal-scroll="vertical" className="min-h-0 min-w-0 space-y-6 overflow-y-auto pb-4">
            {enabledToggle && (
              <div className="flex items-center justify-between gap-3">
                <p className="min-w-0 text-sm font-medium text-gray-700">{t("Enabled")}</p>
                <div className="shrink-0">{enabledToggle}</div>
              </div>
            )}
            {fields}
            {router && profile?.apiKeys[router]?.configured && (
              <RouterSettingsSection provider={router} />
            )}
          </div>
        </Modal>
      )}
    />
  );
}
