import { defineConfig } from "vitest/config"
import tsconfigPaths from "vite-tsconfig-paths"

/**
 * Web-app unit test config.
 *
 * Mirrors the reference project's `vitest.config.ts`. We intentionally
 * scope `include` to `lib/**` so server-only modules under
 * `services/`, `app/`, and `middleware.ts` (which import `next/headers`
 * etc.) are never picked up — vitest cannot resolve those without the
 * Next runtime, and the layered architecture says all unit-testable
 * logic lives in `lib/` anyway.
 */
export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: "node",
    include: ["lib/**/__tests__/**/*.test.ts"],
  },
})
