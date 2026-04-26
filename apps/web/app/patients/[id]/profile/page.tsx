/**
 * Patient / Care Recipient Profile — web stub.
 *
 * This file is not yet wired into a Next.js app (see
 * `apps/web/README.md`). It describes the intended React shape of the
 * caregiver web profile route so the iOS app, web app, and backend
 * contract stay aligned. All data comes from the local mock today.
 *
 * TODO: when apps/web becomes a real Next.js app, replace `mock` with
 * a real fetch:
 *
 *   export default async function Page(
 *     { params }: { params: { id: string } },
 *   ) {
 *     const res = await fetch(`${API_BASE}/care-recipients/${params.id}/profile`, {
 *       headers: { authorization: `Bearer ${await getSessionToken()}` },
 *       cache: "no-store",
 *     })
 *     if (res.status === 403) return <NoAccessState />
 *     if (res.status === 404) return notFound()
 *     if (!res.ok) throw new Error("Failed to load profile")
 *     const { careRecipient } = (await res.json()) as CareRecipientProfileResponse
 *     return <ProfileBody profile={careRecipient} />
 *   }
 *
 * - Do NOT log the response body; it contains PHI.
 * - Do NOT store the token in localStorage; use an httpOnly cookie.
 * - Match the dashboard prototype's visual language (`#3B5BDB` accent,
 *   soft card borders, emerald/amber/red for risk states).
 */

import type {
  CareRecipientProfile,
  CareTeamPermission,
  CareTeamRole,
  DataSource,
  DataSourceStatus,
  DataSourceType,
  RiskLevel,
} from "../../../../../../shared/models/CareRecipientProfile"
import { margaretChen, MOCK_CARE_RECIPIENT_PROFILE_ID } from "./mock"

// ─── Route entry (stub) ─────────────────────────────────────────────────────

type Props = { params: { id: string } }

export default function PatientProfilePage(_props: Props) {
  // TODO: fetch from GET /care-recipients/:id/profile (see header).
  const profile: CareRecipientProfile =
    _props.params.id === MOCK_CARE_RECIPIENT_PROFILE_ID
      ? margaretChen
      : margaretChen

  return <ProfileBody profile={profile} />
}

// ─── Sections ───────────────────────────────────────────────────────────────

function ProfileBody({ profile }: { profile: CareRecipientProfile }) {
  return (
    <main className="mx-auto max-w-3xl space-y-4 px-5 py-6">
      <ProfileHeader profile={profile} />
      <BasicInformation profile={profile} />
      <CareTeamCard profile={profile} />
      <HealthBackgroundCard profile={profile} />
      <DataSourcesCard profile={profile} />
      <BaselineCard profile={profile} />
      <RecentNotesCard profile={profile} />
      <Actions />
    </main>
  )
}

function ProfileHeader({ profile }: { profile: CareRecipientProfile }) {
  return (
    <Card>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
        <Avatar name={profile.name} risk={profile.riskLevel} />
        <div className="flex-1">
          <div className="flex flex-wrap items-start gap-3">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                {profile.name}
              </h1>
              <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
                Age {profile.age}
              </p>
            </div>
            <RiskBadge level={profile.riskLevel} />
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            {profile.primaryConditions.map((condition) => (
              <span
                key={condition}
                className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-700 dark:bg-gray-800 dark:text-gray-300"
              >
                {condition}
              </span>
            ))}
          </div>

          <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">
            Last updated {profile.lastUpdated}
          </p>

          <div className="mt-4">
            <button
              type="button"
              className="inline-flex h-8 items-center rounded-md bg-[#3B5BDB] px-3 text-xs font-semibold text-white hover:bg-[#2F4AC4]"
            >
              Edit profile
            </button>
          </div>
        </div>
      </div>
    </Card>
  )
}

function BasicInformation({ profile }: { profile: CareRecipientProfile }) {
  return (
    <Card>
      <SectionTitle>Basic Information</SectionTitle>
      <dl className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
        <Field label="Full name" value={profile.name} />
        <Field label="Date of birth" value={profile.dateOfBirth} />
        {profile.gender && <Field label="Gender" value={profile.gender} />}
        {profile.contact.phone && (
          <Field label="Phone" value={profile.contact.phone} />
        )}
        {profile.contact.address && (
          <Field label="Address" value={profile.contact.address} />
        )}
      </dl>

      <div className="mt-5 border-t border-gray-200 pt-4 dark:border-gray-800">
        <SubTitle>Emergency contact</SubTitle>
        <dl className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
          <Field label="Name" value={profile.emergencyContact.name} />
          <Field label="Phone" value={profile.emergencyContact.phone} />
          {profile.emergencyContact.relationship && (
            <Field
              label="Relationship"
              value={profile.emergencyContact.relationship}
            />
          )}
        </dl>
      </div>
    </Card>
  )
}

function CareTeamCard({ profile }: { profile: CareRecipientProfile }) {
  return (
    <Card>
      <SectionTitle>Care Team</SectionTitle>
      <Field
        label="Primary caregiver"
        value={profile.careTeam.primaryCaregiver}
      />
      <ul className="mt-3 space-y-2">
        {profile.careTeam.members.map((m) => (
          <li
            key={m.id}
            className="flex items-center gap-3 rounded-md border border-gray-200 p-2 dark:border-gray-800"
          >
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#3B5BDB]/10 text-xs font-semibold text-[#3B5BDB]">
              {initials(m.name)}
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold">{m.name}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {roleLabel(m.role)}
              </p>
            </div>
            <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-semibold text-gray-700 dark:bg-gray-800 dark:text-gray-300">
              {permissionLabel(m.permission)}
            </span>
          </li>
        ))}
      </ul>
    </Card>
  )
}

function HealthBackgroundCard({ profile }: { profile: CareRecipientProfile }) {
  const h = profile.healthBackground
  return (
    <Card>
      <SectionTitle>Health Background</SectionTitle>
      <BulletSection label="Conditions" items={h.conditions} />
      <BulletSection label="Allergies" items={h.allergies} />
      <BulletSection label="Current medications" items={h.medications} />
      {h.mobilityStatus && (
        <Field label="Mobility" value={h.mobilityStatus} />
      )}
      {h.fallRiskNotes && (
        <Field label="Fall risk" value={h.fallRiskNotes} />
      )}
    </Card>
  )
}

function DataSourcesCard({ profile }: { profile: CareRecipientProfile }) {
  return (
    <Card>
      <SectionTitle>Connected Data Sources</SectionTitle>
      <ul className="mt-3 space-y-2">
        {profile.dataSources.map((ds) => (
          <DataSourceRow key={ds.type} source={ds} />
        ))}
      </ul>
    </Card>
  )
}

function BaselineCard({ profile }: { profile: CareRecipientProfile }) {
  const b = profile.baseline
  return (
    <Card>
      <SectionTitle>Baseline Summary</SectionTitle>
      <dl className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
        {b.steps && (
          <Field
            label="Normal daily steps"
            value={`${Math.round(b.steps.min)}–${Math.round(b.steps.max)}`}
          />
        )}
        {b.sleepHours && (
          <Field
            label="Normal sleep"
            value={`${b.sleepHours.min}–${b.sleepHours.max} hrs`}
          />
        )}
        {b.restingHeartRate && (
          <Field
            label="Resting heart rate"
            value={`${Math.round(b.restingHeartRate.min)}–${Math.round(
              b.restingHeartRate.max,
            )} bpm`}
          />
        )}
        {b.bloodPressure && (
          <Field label="Blood pressure" value={`${b.bloodPressure} mmHg`} />
        )}
        {b.lastUpdated && <Field label="Last calibration" value={b.lastUpdated} />}
      </dl>
    </Card>
  )
}

function RecentNotesCard({ profile }: { profile: CareRecipientProfile }) {
  return (
    <Card>
      <SectionTitle>Recent Notes</SectionTitle>
      {profile.recentNotes.length === 0 ? (
        <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">
          No notes recorded.
        </p>
      ) : (
        <ul className="mt-3 space-y-3">
          {profile.recentNotes.map((note) => (
            <li
              key={note.id}
              className="rounded-md border border-gray-200 p-3 dark:border-gray-800"
            >
              <p className="text-sm text-gray-800 dark:text-gray-200">
                {note.content}
              </p>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                {note.author} · {note.createdAt}
              </p>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}

function Actions() {
  return (
    <Card>
      <SectionTitle>Actions</SectionTitle>
      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
        {[
          "Edit profile",
          "Add note",
          "Connect data source",
          "View dashboard",
        ].map((label) => (
          <button
            key={label}
            type="button"
            className="h-9 rounded-md border border-gray-200 bg-white text-sm font-semibold text-gray-800 hover:border-[#3B5BDB] hover:text-[#3B5BDB] dark:border-gray-800 dark:bg-gray-900 dark:text-gray-200"
          >
            {label}
          </button>
        ))}
      </div>
    </Card>
  )
}

// ─── Primitives ─────────────────────────────────────────────────────────────

function Card({ children }: { children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900">
      {children}
    </section>
  )
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-base font-semibold text-gray-900 dark:text-white">
      {children}
    </h2>
  )
}

function SubTitle({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
      {children}
    </p>
  )
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
        {label}
      </dt>
      <dd className="text-sm text-gray-900 dark:text-gray-100">{value}</dd>
    </div>
  )
}

function BulletSection({ label, items }: { label: string; items: string[] }) {
  return (
    <div className="mt-3">
      <SubTitle>{label}</SubTitle>
      {items.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">—</p>
      ) : (
        <ul className="mt-1 list-disc space-y-1 pl-5 text-sm">
          {items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      )}
    </div>
  )
}

function RiskBadge({ level }: { level: RiskLevel }) {
  const palette: Record<RiskLevel, string> = {
    low: "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400",
    moderate: "bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400",
    high: "bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400",
  }
  const labels: Record<RiskLevel, string> = {
    low: "Low",
    moderate: "Moderate",
    high: "High",
  }
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-medium ${palette[level]}`}
    >
      <span
        className={`h-2 w-2 rounded-full ${
          level === "low"
            ? "bg-emerald-500"
            : level === "moderate"
              ? "bg-amber-500"
              : "bg-red-500"
        }`}
      />
      {labels[level]}
    </span>
  )
}

function Avatar({ name, risk }: { name: string; risk: RiskLevel }) {
  const palette: Record<RiskLevel, string> = {
    low: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
    moderate: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
    high: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  }
  return (
    <div
      className={`flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl text-xl font-bold ${palette[risk]}`}
    >
      {initials(name)}
    </div>
  )
}

function DataSourceRow({ source }: { source: DataSource }) {
  const statusPalette: Record<DataSourceStatus, string> = {
    connected: "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400",
    not_connected: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
    error: "bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400",
  }
  return (
    <li className="flex items-center gap-3 rounded-md border border-gray-200 p-2 dark:border-gray-800">
      <div className="flex h-8 w-8 items-center justify-center rounded-md bg-[#3B5BDB]/10 text-xs">
        {dataSourceIcon(source.type)}
      </div>
      <div className="flex-1">
        <p className="text-sm font-semibold">{dataSourceLabel(source.type)}</p>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          {source.lastSyncedAt
            ? `Last synced ${source.lastSyncedAt}`
            : source.errorMessage ?? "Not connected"}
        </p>
      </div>
      <span
        className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${statusPalette[source.status]}`}
      >
        {statusLabel(source.status)}
      </span>
    </li>
  )
}

// ─── Label helpers ──────────────────────────────────────────────────────────

function initials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("")
}

function roleLabel(role: CareTeamRole): string {
  switch (role) {
    case "primary_caregiver":
      return "Primary caregiver"
    case "family_member":
      return "Family member"
    case "clinician":
      return "Clinician"
    case "care_coordinator":
      return "Care coordinator"
  }
}

function permissionLabel(p: CareTeamPermission): string {
  switch (p) {
    case "full_access":
      return "Full access"
    case "limited_access":
      return "Limited access"
    case "clinical_access":
      return "Clinical access"
    case "view_only":
      return "View only"
  }
}

function statusLabel(s: DataSourceStatus): string {
  switch (s) {
    case "connected":
      return "Connected"
    case "not_connected":
      return "Not connected"
    case "error":
      return "Error"
  }
}

function dataSourceLabel(t: DataSourceType): string {
  switch (t) {
    case "apple_health":
      return "Apple Health"
    case "epic":
      return "MyChart / Epic"
    case "fitbit":
      return "Fitbit"
    case "garmin":
      return "Garmin"
    case "ring":
      return "Ring"
    case "fall_detection":
      return "Fall Detection"
  }
}

function dataSourceIcon(t: DataSourceType): string {
  switch (t) {
    case "apple_health":
      return "🍎"
    case "epic":
      return "📋"
    case "fitbit":
    case "garmin":
      return "⌚"
    case "ring":
      return "💍"
    case "fall_detection":
      return "🛡️"
  }
}
