/**
 * Mock-data safety gate for the web MVP.
 *
 * Phase 1 ships every page rendered from `lib/mock-data.ts`. The mock
 * module imports this gate at module load so it cannot be silently
 * bundled into a production build before Phases 3 and 5 swap real data
 * in and stand up the deploy target.
 *
 * Rules:
 *   - In production (`NODE_ENV === "production"`) the env flag
 *     `NEXT_PUBLIC_ALLOW_MOCKS` MUST equal `"true"` for mocks to load.
 *     Anything else throws — fail-closed against accidental PHI-shaped
 *     fixtures reaching real users.
 *   - Outside production the gate is a no-op so local dev and CI can
 *     keep rendering the prototype screens.
 *
 * Why exported and not just a top-level check: callers can `assertMocksAllowed()`
 * inside server actions or route handlers added later without re-importing
 * the whole mock module.
 */
export function assertMocksAllowed(): void {
  if (process.env.NODE_ENV !== "production") return
  if (process.env.NEXT_PUBLIC_ALLOW_MOCKS === "true") return
  throw new Error(
    "[mock-mode] Mock data was loaded in production without " +
      "NEXT_PUBLIC_ALLOW_MOCKS=true. Refusing to render mocks. " +
      "Wire the route to the real backend (Phase 3) before deploying.",
  )
}
