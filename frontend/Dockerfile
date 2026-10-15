# Build from the repository root: `docker build -f frontend/Dockerfile .`
# (docker-compose.yml does the same). The image needs the frontend plus the
# one sibling directory production code reaches through a tsconfig `paths`
# alias: `@mike/contracts` -> /packages/contracts. Nothing else. `next build`
# type-checks tsconfig.build.json, which leaves test files -- and their
# imports of shared fixtures and add-in sources -- out of the image.
#
# A new outside dependency needs a COPY here and a tsconfig alias that
# resolves to the same path; frontend/src/__tests__/architecture.test.ts
# checks that the two agree, and .github/workflows/docker-images.yml builds
# this file in CI so a miss fails the pull request, not the next fresh install.
FROM node:22-slim

WORKDIR /app
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
COPY packages/contracts /packages/contracts

# Browser-side Sentry DSN (optional). Inlined by next build, so it must be
# present here rather than at container start. See docs/observability.md.
ARG NEXT_PUBLIC_SENTRY_DSN=
ARG NEXT_PUBLIC_SENTRY_DISABLED=
ARG NEXT_PUBLIC_SENTRY_INSTALL=
ARG NEXT_PUBLIC_SENTRY_ENVIRONMENT=
ARG NEXT_PUBLIC_SENTRY_RELEASE=
# mikeTR: the interface language (en | tr) is inlined by next build too.
ARG NEXT_PUBLIC_DEFAULT_LOCALE=en
# mikeTR: "true" shows the Google / SSO sign-in buttons; set only once the
# provider is configured (docs/deployment.md).
ARG NEXT_PUBLIC_GOOGLE_LOGIN=
ARG NEXT_PUBLIC_SSO_LOGIN=
# mikeTR: the operator's own terms / privacy notice shown at sign-up. Empty
# shows the mikeTR templates (docs/kullanim-kosullari.md, docs/gizlilik.md).
ARG NEXT_PUBLIC_TERMS_URL=
ARG NEXT_PUBLIC_PRIVACY_URL=
# The commit this image was built from; the release tag when no explicit
# release is given, for the browser bundle (inlined) and the Next server.
ARG GIT_SHA=
ENV NEXT_PUBLIC_SENTRY_DSN=$NEXT_PUBLIC_SENTRY_DSN \
    NEXT_PUBLIC_SENTRY_DISABLED=$NEXT_PUBLIC_SENTRY_DISABLED \
    NEXT_PUBLIC_SENTRY_INSTALL=$NEXT_PUBLIC_SENTRY_INSTALL \
    NEXT_PUBLIC_SENTRY_ENVIRONMENT=$NEXT_PUBLIC_SENTRY_ENVIRONMENT \
    NEXT_PUBLIC_SENTRY_RELEASE=$NEXT_PUBLIC_SENTRY_RELEASE \
    NEXT_PUBLIC_DEFAULT_LOCALE=$NEXT_PUBLIC_DEFAULT_LOCALE \
    NEXT_PUBLIC_GOOGLE_LOGIN=$NEXT_PUBLIC_GOOGLE_LOGIN \
    NEXT_PUBLIC_SSO_LOGIN=$NEXT_PUBLIC_SSO_LOGIN \
    NEXT_PUBLIC_TERMS_URL=$NEXT_PUBLIC_TERMS_URL \
    NEXT_PUBLIC_PRIVACY_URL=$NEXT_PUBLIC_PRIVACY_URL \
    NEXT_PUBLIC_GIT_SHA=$GIT_SHA \
    GIT_SHA=$GIT_SHA

RUN npm run build

ENV NODE_ENV=production
EXPOSE 3000
CMD ["npm", "start"]
