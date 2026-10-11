/// <reference types="office-js" />

/**
 * Ambient declaration for webpack EnvironmentPlugin substitutions.
 * These values are replaced while webpack builds the task-pane bundle.
 */
declare const process: {
  readonly env: {
    readonly REACT_APP_API_BASE_URL: string | undefined;
    readonly REACT_APP_DEFAULT_MODEL: string | undefined;
    readonly REACT_APP_WEB_APP_URL: string | undefined;
    readonly REACT_APP_SENTRY_DISABLED: string | undefined;
    readonly REACT_APP_SENTRY_DSN: string | undefined;
    readonly REACT_APP_SENTRY_INSTALL: string | undefined;
    readonly REACT_APP_SENTRY_ENVIRONMENT: string | undefined;
    readonly REACT_APP_SENTRY_RELEASE: string | undefined;
    readonly REACT_APP_GIT_SHA: string | undefined;
    readonly REACT_APP_SENTRY_TRACES_SAMPLE_RATE: string | undefined;
    readonly NODE_ENV: string;
    // Read by the shared i18n module (frontend/src/shared/i18n). Webpack does
    // not substitute it and `process` does not exist at runtime, so the
    // add-in always uses the module's English default.
    readonly NEXT_PUBLIC_DEFAULT_LOCALE?: string;
  };
};
