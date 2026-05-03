import { describe, expect, test } from "vitest"
import type { CareRecipientProfile } from "@models/CareRecipientProfile"
import {
  careRecipientListRowToItem,
  careRecipientProfileToHeader,
  dataSourceRegistryRowToView,
  profileTypeForRegistrySource,
  type CareRecipientListInput,
} from "../careRecipientToSenior"

const ROW_TEMPLATE: CareRecipientListInput = {
  id: "11111111-1111-4111-a111-111111111111",
  name: "Eleanor Yang",
  date_of_birth: "1948-03-15",
  primary_condition: "Type 2 Diabetes",
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-05-01T00:00:00Z",
  role: "primary_caregiver",
  permission_level: "full_access",
}

const PROFILE_TEMPLATE = {
  id: "11111111-1111-4111-a111-111111111111",
  name: "Margaret Chen",
  age: 78,
  dateOfBirth: "1947-02-14",
  gender: "Female",
  primaryConditions: ["Type 2 Diabetes", "Hypertension"],
  riskLevel: "moderate",
  contact: {
    phone: "+1-415-555-0142",
    address: "1280 Sunset Blvd, San Francisco, CA 94122",
  },
  emergencyContact: {
    name: "James Chen",
    phone: "+1-415-555-0199",
    relationship: "Son",
  },
  careTeam: {
    primaryCaregiver: "Becca Yang",
    members: [
      {
        id: "ctm-1",
        name: "Becca Yang",
        role: "primary_caregiver",
        permission: "full_access",
      },
      {
        id: "ctm-2",
        name: "Dr. Alice Wu",
        role: "clinician",
        permission: "clinical_access",
      },
    ],
  },
  healthBackground: {
    conditions: [],
    allergies: [],
    medications: [],
  },
  dataSources: [
    { type: "apple_health", status: "connected", lastSyncedAt: "2026-05-02T12:00:00Z" },
    { type: "epic", status: "not_connected" },
  ],
  baseline: {},
  recentNotes: [],
  lastUpdated: "2026-05-02T12:00:00Z",
} satisfies CareRecipientProfile

describe("careRecipientListRowToItem", () => {
  test("maps the full row to the thin view-model shape", () => {
    const asOf = new Date("2026-05-02T00:00:00Z")
    const item = careRecipientListRowToItem(ROW_TEMPLATE, asOf)
    expect(item.id).toBe(ROW_TEMPLATE.id)
    expect(item.name).toBe(ROW_TEMPLATE.name)
    expect(item.age).toBe(78)
    expect(item.primaryConditions).toEqual(["Type 2 Diabetes"])
    expect(item.status).toBe("routine")
    expect(item.role).toBe("primary_caregiver")
    expect(item.permissionLevel).toBe("full_access")
    expect(item.updatedAt).toBe(ROW_TEMPLATE.updated_at)
  })

  test("returns null age when date_of_birth is missing or unparsable", () => {
    const asOf = new Date("2026-05-02T00:00:00Z")
    expect(
      careRecipientListRowToItem({ ...ROW_TEMPLATE, date_of_birth: null }, asOf).age,
    ).toBeNull()
    expect(
      careRecipientListRowToItem(
        { ...ROW_TEMPLATE, date_of_birth: "not-a-date" },
        asOf,
      ).age,
    ).toBeNull()
  })

  test("subtracts a year when the birthday has not passed yet this year", () => {
    const beforeBirthday = new Date("2026-03-14T00:00:00Z")
    const onBirthday = new Date("2026-03-15T00:00:00Z")
    const afterBirthday = new Date("2026-03-16T00:00:00Z")
    expect(careRecipientListRowToItem(ROW_TEMPLATE, beforeBirthday).age).toBe(77)
    expect(careRecipientListRowToItem(ROW_TEMPLATE, onBirthday).age).toBe(78)
    expect(careRecipientListRowToItem(ROW_TEMPLATE, afterBirthday).age).toBe(78)
  })

  test("empty primary_condition produces an empty conditions array", () => {
    const item = careRecipientListRowToItem(
      { ...ROW_TEMPLATE, primary_condition: null },
      new Date(),
    )
    expect(item.primaryConditions).toEqual([])
  })

  test("status defaults to routine (no phase 3 signal yet)", () => {
    const item = careRecipientListRowToItem(ROW_TEMPLATE)
    expect(item.status).toBe("routine")
  })
})

describe("careRecipientProfileToHeader", () => {
  test("maps a full profile to the header shape with enum → status translation", () => {
    const header = careRecipientProfileToHeader(PROFILE_TEMPLATE)
    expect(header.id).toBe(PROFILE_TEMPLATE.id)
    expect(header.name).toBe("Margaret Chen")
    expect(header.age).toBe(78)
    expect(header.location).toBe(PROFILE_TEMPLATE.contact.address)
    expect(header.status).toBe("monitor")
    expect(header.primaryConditions).toEqual(["Type 2 Diabetes", "Hypertension"])
    expect(header.lastSeen).toBe(PROFILE_TEMPLATE.lastUpdated)
  })

  test("maps risk levels to the dashboard vocabulary", () => {
    const low = careRecipientProfileToHeader({ ...PROFILE_TEMPLATE, riskLevel: "low" })
    const mod = careRecipientProfileToHeader({ ...PROFILE_TEMPLATE, riskLevel: "moderate" })
    const high = careRecipientProfileToHeader({ ...PROFILE_TEMPLATE, riskLevel: "high" })
    expect(low.status).toBe("routine")
    expect(mod.status).toBe("monitor")
    expect(high.status).toBe("critical")
  })

  test("drops care-team members with no display name and humanizes roles", () => {
    const header = careRecipientProfileToHeader({
      ...PROFILE_TEMPLATE,
      careTeam: {
        primaryCaregiver: "",
        members: [
          { id: "a", name: "Alice", role: "primary_caregiver", permission: "full_access" },
          { id: "b", name: "", role: "family_member", permission: "view_only" },
        ],
      },
    })
    expect(header.careTeam).toHaveLength(1)
    expect(header.careTeam[0].name).toBe("Alice")
    expect(header.careTeam[0].role).toBe("Primary Caregiver")
    expect(header.careTeam[0].phone).toBe("")
    expect(header.careTeam[0].email).toBe("")
    expect(header.careTeam[0].organization).toBeNull()
  })

  test("maps data-source enums to the UI type + friendly name", () => {
    const header = careRecipientProfileToHeader(PROFILE_TEMPLATE)
    const appleHealth = header.dataSources.find((s) => s.name === "Apple Health")
    const epic = header.dataSources.find((s) => s.name === "Epic MyChart")
    expect(appleHealth).toBeDefined()
    expect(appleHealth?.type).toBe("wearable")
    expect(appleHealth?.connected).toBe(true)
    expect(appleHealth?.lastSync).toBe("2026-05-02T12:00:00Z")
    expect(epic).toBeDefined()
    expect(epic?.connected).toBe(false)
    expect(epic?.lastSync).toBe("")
  })

  test("tolerates missing optional profile fields without throwing", () => {
    const sparse: CareRecipientProfile = {
      ...PROFILE_TEMPLATE,
      contact: {},
      careTeam: { primaryCaregiver: "", members: [] },
      dataSources: [],
      primaryConditions: [],
    }
    const header = careRecipientProfileToHeader(sparse)
    expect(header.location).toBe("")
    expect(header.careTeam).toEqual([])
    expect(header.dataSources).toEqual([])
    expect(header.primaryConditions).toEqual([])
  })
})

describe("dataSourceRegistryRowToView (Phase 4A)", () => {
  test("maps the registry-only `healthkit` transport to the Apple Health view model", () => {
    const view = dataSourceRegistryRowToView({
      id: "row-1",
      source_type: "healthkit",
      status: "connected",
      last_synced_at: "2026-05-02T12:00:00Z",
      error_message: null,
    })
    expect(view.name).toBe("Apple Health")
    expect(view.type).toBe("wearable")
    expect(view.connected).toBe(true)
    expect(view.lastSync).toBe("2026-05-02T12:00:00Z")
  })

  test("renders a never-synced row as `not connected` (lastSync empty string)", () => {
    const view = dataSourceRegistryRowToView({
      id: "row-1",
      source_type: "healthkit",
      status: "not_connected",
      last_synced_at: null,
      error_message: null,
    })
    expect(view.connected).toBe(false)
    expect(view.lastSync).toBe("")
  })

  test("falls through to a humanised name for unknown registry source types", () => {
    const view = dataSourceRegistryRowToView({
      id: "row-1",
      source_type: "other_partner",
      status: "connected",
      last_synced_at: null,
      error_message: null,
    })
    expect(view.name).toBe("Other Partner")
    expect(view.type).toBe("wearable")
  })

  test("`error` status renders as not connected (no false-positive green dot)", () => {
    const view = dataSourceRegistryRowToView({
      id: "row-1",
      source_type: "epic",
      status: "error",
      last_synced_at: "2026-05-02T12:00:00Z",
      error_message: "Token expired",
    })
    expect(view.connected).toBe(false)
  })
})

describe("profileTypeForRegistrySource (Phase 4A)", () => {
  test("collapses the registry-only healthkit transport onto apple_health", () => {
    expect(profileTypeForRegistrySource("healthkit")).toBe("apple_health")
  })

  test("passes through profile-contract source types unchanged", () => {
    expect(profileTypeForRegistrySource("apple_health")).toBe("apple_health")
    expect(profileTypeForRegistrySource("epic")).toBe("epic")
    expect(profileTypeForRegistrySource("fall_detection")).toBe("fall_detection")
  })

  test("returns null for unknown registry source types", () => {
    expect(profileTypeForRegistrySource("other_partner")).toBeNull()
  })
})
