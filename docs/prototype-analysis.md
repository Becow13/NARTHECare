# Prototype Analysis — NARTHECare

> **Updated May 2, 2026:**
> NARTHECare is now **web-first**. The prototype is the source of truth for
> the **web caregiver dashboard** (`apps/web/`). iOS is a HealthKit sync
> companion only during the web MVP phase. The §5 (iOS-specific decisions)
> section below is deprioritized. For the full implementation plan see
> **[`docs/web-mvp-plan.md`](web-mvp-plan.md)**.

Source: `/Users/d2118370gmail.com/Downloads/NARTHECare/Prototype Code/`

The prototype is a **Next.js 14 / Tailwind caregiver dashboard** plus
three SVG brand assets and one standalone dashboard JS snippet. This doc
captures what the web app must reuse and what should be intentionally
dropped. It is the source of truth for visual style, product terminology,
and data shape used under `apps/web/`, `shared/contracts/`, and `shared/models/`.

---

## 1. Prototype shape

```
Prototype Code/
  narthecare-*.svg                    Brand marks
  Foundational Dashboard Code.js      Single-file HTML/JS dashboard prototype
  NARTHECare Dashboard Pages Code/    Next.js 14 caregiver dashboard
    app/
      layout.tsx                      Sidebar + main content shell
      globals.css                     Tailwind tokens (HSL + --primary 160 68% 37%)
      page.tsx                        Redirect to /dashboard
      dashboard/page.tsx              Care Hub (overview of all Care Members)
      seniors/page.tsx                List of Care Members
      seniors/[id]/page.tsx           Senior detail (header + vitals + alerts)
      alerts/                         Alerts list
      appointments/                   Upcoming appointments
      insights/                       AI summaries
      action-plans/                   Care plans
      settings/
    components/
      sidebar.tsx                     Persistent left-side nav
      care-team-list.tsx              Collapsible "show all N" list
      data-sources-list.tsx           Dotted status + last-sync text
      data-freshness-badge.tsx        "Live" vs "7-day avg" pill
      senior-tabs.tsx                 CTAs to Action Plans / Appointments
      sparkline.tsx                   Tiny inline line chart
      vitals-legend.tsx               Legend explaining vital thresholds
      ui/                             shadcn-style primitives (Card, Badge, Button, Separator)
    lib/
      mock-data.ts                    All seed data + types (seniors, alerts, summaries)
      alert-rules.ts                  Thresholds / categories
      utils.ts                        formatRelativeTime, formatDateTime, cn()
```

The prototype is a **dashboard-first caregiver web surface** — it does
not have a patient-owned view, no iOS code, and no backend. It is a
visual / product-shape spec, not a code drop.

---

## 2. What to reuse

### 2.1 Visual language

| Token                      | Prototype value                        | Production use                                                  |
| -------------------------- | -------------------------------------- | --------------------------------------------------------------- |
| Brand accent               | `#3B5BDB` (indigo)                     | Action buttons, link hovers, focus ring                         |
| Secondary accent           | `#1D9E75` / `narthe.green` palette     | Live badges, positive status, "show all" link                   |
| Background                 | `bg-gray-50 dark:bg-gray-950`          | App chrome                                                      |
| Card surface               | white / `dark:bg-gray-900` + border    | `InfoCard` on iOS, `<section>` card on web                      |
| Card corner                | `rounded-lg` (8 px)                    | iOS `RoundedRectangle(cornerRadius: 14)` reads similarly at 3x  |
| Border                     | `border-border` (gray-200 / gray-800)  | `Color.ncBorder` tokens in iOS                                  |
| State colors               | emerald (good) / amber (monitor) / red | `RiskBadge`, `StatusBadge`, `DataSourceRow` dot                 |
| Headings                   | `text-2xl font-bold` (header)          | iOS `.font(.title2.bold())`                                     |
| Section titles             | `text-base font-semibold`              | `SectionHeader(level: .main)`                                   |
| Sub-section labels         | `text-[10px] uppercase tracking-wide`  | `SectionHeader(level: .sub)` / uppercased caption on iOS        |
| Avatar                     | `rounded-2xl` initials, risk-tinted    | `Avatar` inside `ProfileHeaderCard`                             |
| Chip                       | `rounded-full bg-gray-100` soft pill   | `ConditionChipRow`                                              |
| Navigation (web only)      | Persistent left sidebar, 240 px wide   | Web `apps/web/app/layout.tsx` (future); iOS uses `NavigationStack` |

### 2.2 Product terminology

The prototype renames "senior" → **Care Member** in the UI (but keeps
`senior` in code). We adopt **Care Recipient** in the data contract
(clinical register) and surface it as **Patient** / **Care Member** in
UI copy to match the prototype's calm, familial tone.

- Tabs: `Care Hub`, `Care Members`, `Alerts`, `Appointments`,
  `AI Insights`, `Action Plans`, `Settings`.
- Status vocabulary: `routine` (good) / `monitor` / `critical` on the
  dashboard; we map this onto the profile's `low` / `moderate` / `high`
  `riskLevel` so both views read coherently.
- Data-source families: EHR (MyChart / Epic), wearable (Apple Watch,
  Fitbit, Garmin), camera (Ring, Nest), fall detection (Life Alert,
  Medical Guardian), medication (MedMinder). The profile schema keeps
  the subset the first iOS screen needs (Apple Health, Epic, Fitbit,
  Garmin, Ring, Fall detection).

### 2.3 Layout patterns worth reproducing

- **Header card with three vertical bands** (senior info | care team |
  data sources) — the Patient Profile uses the same idea stacked
  vertically as separate cards so it works comfortably on a phone.
- **Labelled rows** (`label | value`) used for demographics and
  baselines. Preferred over floating `dl`/`dt` markup.
- **"show all N"** inline toggle for long lists (care team, data
  sources). Worth implementing when the profile's care team exceeds
  ~4 members.
- **Relative time** (`synced 12 min ago`) via a shared formatter —
  mirrored in iOS as `formatRelative(_:)`.

---

## 3. What to drop

| Prototype artifact                              | Why we drop it                                                             |
| ----------------------------------------------- | -------------------------------------------------------------------------- |
| `Foundational Dashboard Code.js`                | Standalone demo, not a pattern we want to ship                             |
| `lib/mock-data Broken.ts`                       | Broken draft, ignored                                                      |
| Tailwind CSS variables via HSL (`--primary`)    | Replaced by a small `Color.nc*` token set on iOS; web will re-adopt these later when it becomes a real Next.js app |
| shadcn `Card`, `Badge`, `Button`, `Separator`   | We re-implement equivalents on iOS as `InfoCard`, `RiskBadge`, `StatusBadge` |
| `Sparkline`, `VitalsLegend`, `DataFreshnessBadge` | Dashboard-only; not needed for the Patient Profile feature               |
| `formatRelativeTime` using ISO dates            | Ported, but we also gracefully fall back when the backend sends plain `YYYY-MM-DD` (`baseline.lastUpdated`) |

---

## 4. Mapping prototype ↔ production contract

The prototype's `Senior` type is dashboard-shaped (it carries
`vitals.readings[]`, `alerts[]`, `summaries[]`). The
**Care Recipient Profile** is a narrower slice: identity, care team,
baseline, and the data sources the profile is allowed to manage. The
mapping is:

| Prototype field                            | `CareRecipientProfile` field                 | Notes                                     |
| ------------------------------------------ | -------------------------------------------- | ----------------------------------------- |
| `senior.name`                              | `name`                                       | Same                                      |
| `senior.age`                               | `age`                                        | Same                                      |
| `senior.primaryConditions`                 | `primaryConditions`                          | Same                                      |
| `senior.status`                            | `riskLevel` (`routine` → `low`, etc.)        | Stored as low / moderate / high          |
| `senior.lastSeen`                          | *(dashboard only)*                           | Not on the profile                        |
| `senior.caregivers[]`                      | `careTeam.members[]` + `emergencyContact`    | Only `isPrimary === true` → `primaryCaregiver` |
| `senior.dataSources[]`                     | `dataSources[]`                              | Subset of integrations, narrower enum     |
| `senior.vitals.readings[]`                 | `baseline` (min/max ranges)                  | We don't ship raw readings on the profile |
| `senior.alerts[]`, `senior.summaries[]`    | *(dashboard only)*                           | Live elsewhere                            |
| `senior.careTeam[]` (clinicians)           | `careTeam.members[]` with `role: clinician`  |                                           |

This is why the Patient Profile screen intentionally has **no sparkline
and no alerts** — those surfaces belong on a future `PatientDashboardView`.

---

## 5. iOS-specific decisions anchored in the prototype

1. **Screen is scroll-driven** (`ScrollView`) with vertically stacked
   `InfoCard`s — the prototype's three-band header doesn't fit on a
   phone, so the same info appears as three cards in reading order.
2. **SF Symbols** replace `lucide-react` 1:1 (`heart.text.square` for
   Apple Health, `cross.case` for Epic, etc.).
3. **Colors** live on `Color.nc*` extensions so the rest of the app
   can reuse them and so the web app eventually re-derives them from
   the same hex values.
4. **No blocking navigation**: the profile is a leaf screen today, so
   it lives inside a `NavigationStack` but exposes only an "Edit
   profile" CTA and the four action buttons at the bottom.

---

## 6. Open questions

Captured so they are not lost when the app leaves this prototype-based
phase.

- **Terminology:** settle on `Patient` (clinical) vs
  `Care Recipient` (data contract) vs `Care Member` (UI) across every
  surface. Currently UI copy uses "Patient Profile" and the data
  contract uses `careRecipient`.
- **Risk level granularity:** `low / moderate / high` is correct for the
  profile header, but the dashboard uses `routine / monitor / critical`.
  We keep both — the profile is the clinical classification, the
  dashboard is the real-time operational classification.
- **Data-source shape:** do we ship device model (e.g. "Apple Watch SE")
  on the profile, or only the integration family? The prototype ships
  the device model; the current contract only ships the family. Revisit
  when we build the "Connect data source" flow.
- **PHI in URLs:** `/patients/:id/profile` is fine because `id` is a
  UUID; if we ever switch to handle / slug routes, revisit and make sure
  no identifying token ends up in server access logs.
