// /lib/mock-data.ts

export type Senior = {
  id: string
  name: string
  age: number
  photo: string | null
  primaryConditions: string[]
  location: string
  caregivers: Caregiver[]
  dataSources: DataSource[]
  vitals: VitalsHistory
  alerts: Alert[]
  summaries: AISummary[]
  status: "stable" | "monitor" | "alert"
  lastSeen: string // ISO timestamp
}

export type Caregiver = {
  id: string
  name: string
  role: "family" | "professional" | "agency"
  relationship: string // "daughter", "home aide", "care coordinator"
  email: string
  phone: string
  isPrimary: boolean
}

export type DataSource = {
  id: string
  name: string
  type: "ehr" | "wearable" | "camera" | "fall_detection" | "medication"
  provider: string // "MyChart", "Apple Health", "Ring", "Life Alert"
  connected: boolean
  lastSync: string // ISO timestamp
}

export type VitalsReading = {
  timestamp: string
  heartRate: number       // bpm
  bloodPressureSys: number
  bloodPressureDia: number
  sleepHours: number
  activityMinutes: number
  oxygenSaturation: number
}

export type VitalsHistory = {
  seniorId: string
  readings: VitalsReading[] // last 30 days, one per day
}

export type Alert = {
  id: string
  seniorId: string
  seniorName: string
  type: "vitals" | "fall" | "medication" | "behavioral" | "appointment"
  severity: "critical" | "moderate" | "low"
  title: string
  description: string
  aiExplanation: string  // plain language AI interpretation
  timestamp: string
  status: "active" | "acknowledged" | "resolved"
  actionTaken: string | null
  resolvedBy: string | null
  resolvedAt: string | null
}

export type AISummary = {
  id: string
  seniorId: string
  seniorName: string
  generatedAt: string
  summaryType: "daily" | "post_visit" | "weekly" | "anomaly"
  plainTextSummary: string
  keyInsights: string[]
  recommendedActions: string[]
  sourceTags: string[]   // ["MyChart", "Apple Watch", "Ring Camera"]
  urgency: "routine" | "attention" | "urgent"
}

export type CareTeamMember = {
  id: string
  name: string
  role: string
  organization: string | null
  phone: string
  email: string
}

export type DashboardStats = {
  activeSeniors: number
  alertsToday: number
  upcomingAppointments: number
  overallStatus: "all_stable" | "needs_attention" | "critical"
}
