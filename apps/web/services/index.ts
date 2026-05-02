/**
 * Service-layer barrel.
 *
 * Mirrors `apps/backend/services/index.js` and the reference project's
 * `services/index.ts`. Route handlers and Server Components import the
 * service surface from this barrel so the underlying file layout can
 * change without churning every consumer.
 */

export * as cognitoService from "./cognitoService"
export * as sessionService from "./sessionService"
export * as apiClient from "./apiClient"
