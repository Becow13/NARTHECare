# apps/web — stub

> **Status: not runnable yet.** This folder holds a single Next.js-style
> `page.tsx` stub that describes the intended route shape for the
> Caregiver Web UI. There is no `package.json`, no `tsconfig.json`, and
> no build step here — wiring it into a real Next.js app is a separate
> task.

## What's here today

```
apps/web/
  app/
    patients/
      [id]/
        profile/
          page.tsx   ← stub React component for the patient profile page
          mock.ts    ← local mock data matching the shared contract
  README.md          ← this file
```

## When a Next.js app is added

The intended target layout (copied here so future work does not drift):

```
apps/web/
  package.json          next, react, typescript, tailwindcss
  tsconfig.json         paths: "@models/*" → "../../shared/models/*"
  next.config.mjs
  postcss.config.mjs
  tailwind.config.ts
  app/
    layout.tsx
    globals.css
    patients/[id]/profile/page.tsx
  components/
    patient-profile/    reusable cards mirroring the iOS components
  public/
```

When wiring this up:

1. Import types from the shared contract
   (`shared/models/CareRecipientProfile.ts`) — never duplicate the
   shape in this folder.
2. Replace `mock.ts` with a real fetch to
   `GET /care-recipients/:id/profile` (TODO comment in `page.tsx`).
3. Match the caregiver dashboard prototype's visual language: soft card
   borders, `#3B5BDB` accent, emerald/amber/red for risk states,
   calm typography.
4. Keep the session Cognito JWT in an httpOnly cookie — never in
   `localStorage`. Forward the `Authorization: Bearer <token>` header
   server-side.
5. Respect the same RBAC the backend enforces: the page must render a
   friendly 403 screen when the API returns 403.

## Rule: no schema drift

Because the web page will import the TS contract directly from
`shared/models/`, any field rename or retype MUST be made in the
`.ts` file first. The backend's JS mirror (`CareRecipientProfile.js`)
and the iOS `CareRecipientProfile.swift` must be updated in the same
change. See `shared/models/README.md`.
