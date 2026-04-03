// /lib/mock-data.ts
// NartheCare — AI-Powered Remote Eldercare Platform
// Complete mock data file — types + seed data
// Replace MOCK_ constants with real API calls when backend is ready
// Every component imports from this file only — single swap point for real data

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 1: TYPE DEFINITIONS
// ─────────────────────────────────────────────────────────────────────────────

export type SeniorStatus = "stable" | "monitor" | "alert";
export type AlertSeverity = "critical" | "moderate" | "low";
export type AlertStatus = "active" | "acknowledged" | "resolved";
export type AlertType =
  | "fall_detected"
  | "inactivity"
  | "fall_device_offline"
  | "wandering"
  | "camera_night_motion"
  | "blood_pressure"
  | "heart_rate"
  | "irregular_rhythm"
  | "oxygen_saturation"
  | "medication_missed_critical"
  | "medication_double_dose"
  | "dementia_no_activity"
  | "all_devices_offline"
  | "gps_unusual_location"
  | "gps_not_home_overnight"
  | "vitals_trending"
  | "weight_change"
  | "sleep_duration"
  | "sleep_pattern"
  | "sleep_schedule"
  | "medication_late"
  | "activity_declined"
  | "no_outdoor_activity"
  | "appointment_upcoming_48h"
  | "appointment_missed"
  | "no_kitchen_activity"
  | "fridge_no_interaction"
  | "routine_variation"
  | "sleep_slightly_low"
  | "activity_slightly_low"
  | "appointment_upcoming_week"
  | "prescription_refill"
  | "wellness_visit_due"
  | "activity_above_baseline"
  | "best_sleep_week"
  | "medication_adherence_streak"
  | "device_not_synced"
  | "wearable_battery_low"
  | "visitor_detected"
  | "phone_activity_low"
  | "tv_pattern_changed";

export type AlertCategory =
  | "falls_safety"
  | "cardiovascular"
  | "medication"
  | "behavioral"
  | "device_data"
  | "vitals_trending"
  | "sleep"
  | "activity_mobility"
  | "appointment"
  | "nutrition"
  | "routine"
  | "upcoming_items"
  | "positive_signal"
  | "device_connectivity"
  | "social_behavioral";
export type SummaryType = "daily" | "post_visit" | "weekly" | "anomaly";
export type SummaryUrgency = "routine" | "attention" | "urgent";
export type CaregiverRole = "family" | "professional" | "agency";
export type DataSourceType = "ehr" | "wearable" | "camera" | "fall_detection" | "medication";
export type DashboardOverallStatus = "all_stable" | "needs_attention" | "critical";

export type Caregiver = {
  id: string;
  name: string;
  role: CaregiverRole;
  relationship: string;
  email: string;
  phone: string;
  isPrimary: boolean;
};

export type DataSource = {
  id: string;
  name: string;
  type: DataSourceType;
  provider: string;
  connected: boolean;
  lastSync: string;
};

export type VitalsReading = {
  timestamp: string;
  heartRate: number;
  bloodPressureSys: number;
  bloodPressureDia: number;
  sleepHours: number;
  activityMinutes: number;
  oxygenSaturation: number;
};

export type VitalsHistory = {
  seniorId: string;
  readings: VitalsReading[];
};

export type Alert = {
  id: string;
  seniorId: string;
  seniorName: string;
  type: AlertType;
  category: AlertCategory;
  severity: AlertSeverity;
  title: string;
  description: string;
  aiExplanation: string;
  timestamp: string;
  status: AlertStatus;
  actionTaken: string | null;
  resolvedBy: string | null;
  resolvedAt: string | null;
  personalThresholdApplied: boolean;
  patternAlert: boolean;
  contextSuppressible: boolean;
  suppressedBy: string | null;
};

export type AISummary = {
  id: string;
  seniorId: string;
  seniorName: string;
  generatedAt: string;
  summaryType: SummaryType;
  plainTextSummary: string;
  keyInsights: string[];
  recommendedActions: string[];
  sourceTags: string[];
  urgency: SummaryUrgency;
};

export type CareTeamMember = {
  id: string;
  name: string;
  role: string;
  organization: string | null;
  phone: string;
  email: string;
};

export type Appointment = {
  id: string;
  seniorId: string;
  seniorName: string;
  title: string;
  provider: string;
  location: string;
  dateTime: string;
  notes: string | null;
};

export type Senior = {
  id: string;
  name: string;
  age: number;
  photo: string | null;
  primaryConditions: string[];
  location: string;
  status: SeniorStatus;
  lastSeen: string;
  caregivers: Caregiver[];
  dataSources: DataSource[];
  vitals: VitalsHistory;
  alerts: Alert[];
  summaries: AISummary[];
  careTeam: CareTeamMember[];
};

export type DashboardStats = {
  activeSeniors: number;
  alertsToday: number;
  upcomingAppointments: number;
  overallStatus: DashboardOverallStatus;
};

export type ActionOption = {
  level: "standard" | "better" | "best";
  title: string;
  description: string;
  estimatedCost: string;
  timeToComplete: string;
  difficulty: "easy" | "moderate" | "involved";
};

export type ActionPlanResource = {
  type: "service" | "device" | "professional" | "insurance" | "community";
  name: string;
  description: string;
  estimatedCost: string;
  contactOrLink: string;
  localToSenior: boolean;
};

export type ActionPlan = {
  id: string;
  seniorId: string;
  seniorName: string;
  linkedAlertIds: string[];
  title: string;
  summary: string;
  generatedAt: string;
  status: "open" | "in_progress" | "complete";
  chosenOptionLevel: "standard" | "better" | "best" | null;
  caregiverNotes: string;
  immediateActions: ActionOption[];
  financialConsiderations: string;
  resources: ActionPlanResource[];
};

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 2: HELPER — generates 30 days of realistic vitals data
// ─────────────────────────────────────────────────────────────────────────────

function generateVitalsHistory(
  seniorId: string,
  baseHeartRate: number,
  baseSysBP: number,
  baseDiaBP: number
): VitalsHistory {
  const readings: VitalsReading[] = [];
  const now = new Date();

  for (let i = 29; i >= 0; i--) {
    const date = new Date(now);
    date.setDate(date.getDate() - i);

    const jitter = (range: number) =>
      Math.round((Math.random() - 0.5) * range);

    readings.push({
      timestamp: date.toISOString(),
      heartRate: Math.max(55, baseHeartRate + jitter(14)),
      bloodPressureSys: Math.max(100, baseSysBP + jitter(20)),
      bloodPressureDia: Math.max(60, baseDiaBP + jitter(12)),
      sleepHours: Math.round((5.5 + Math.random() * 3) * 10) / 10,
      activityMinutes: Math.max(0, Math.round(25 + jitter(30))),
      oxygenSaturation: Math.min(100, Math.max(93, 97 + jitter(3))),
    });
  }

  return { seniorId, readings };
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 3: SEED DATA — CAREGIVERS
// ─────────────────────────────────────────────────────────────────────────────

const CAREGIVERS_ELEANOR: Caregiver[] = [
  {
    id: "cg-001",
    name: "Becca Yang",
    role: "family",
    relationship: "Daughter",
    email: "becca.yang@email.com",
    phone: "(408) 555-0142",
    isPrimary: true,
  },
  {
    id: "cg-002",
    name: "Michael Yang",
    role: "family",
    relationship: "Son",
    email: "michael.yang@email.com",
    phone: "(415) 555-0198",
    isPrimary: false,
  },
  {
    id: "cg-003",
    name: "Rosa Martinez",
    role: "professional",
    relationship: "Home Aide",
    email: "rosa.m@careagency.com",
    phone: "(650) 555-0177",
    isPrimary: false,
  },
];

const CAREGIVERS_ROBERT: Caregiver[] = [
  {
    id: "cg-004",
    name: "James Chen",
    role: "family",
    relationship: "Son",
    email: "james.chen@email.com",
    phone: "(510) 555-0134",
    isPrimary: true,
  },
  {
    id: "cg-005",
    name: "Linda Chen",
    role: "family",
    relationship: "Daughter-in-law",
    email: "linda.chen@email.com",
    phone: "(510) 555-0156",
    isPrimary: false,
  },
];

const CAREGIVERS_MARGARET: Caregiver[] = [
  {
    id: "cg-006",
    name: "Patricia Sullivan",
    role: "family",
    relationship: "Daughter",
    email: "p.sullivan@email.com",
    phone: "(408) 555-0189",
    isPrimary: true,
  },
  {
    id: "cg-007",
    name: "Marcus Thompson",
    role: "professional",
    relationship: "Care Coordinator",
    email: "m.thompson@brighthomecare.com",
    phone: "(669) 555-0112",
    isPrimary: false,
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 4: SEED DATA — DATA SOURCES
// ─────────────────────────────────────────────────────────────────────────────

const DATA_SOURCES_ELEANOR: DataSource[] = [
  {
    id: "ds-001",
    name: "MyChart — Stanford Health",
    type: "ehr",
    provider: "MyChart",
    connected: true,
    lastSync: new Date(Date.now() - 1000 * 60 * 47).toISOString(),
  },
  {
    id: "ds-002",
    name: "Apple Watch Series 9",
    type: "wearable",
    provider: "Apple Health",
    connected: true,
    lastSync: new Date(Date.now() - 1000 * 60 * 12).toISOString(),
  },
  {
    id: "ds-003",
    name: "Ring Doorbell Camera",
    type: "camera",
    provider: "Ring",
    connected: true,
    lastSync: new Date(Date.now() - 1000 * 60 * 8).toISOString(),
  },
  {
    id: "ds-004",
    name: "MedMinder Smart Dispenser",
    type: "medication",
    provider: "MedMinder",
    connected: true,
    lastSync: new Date(Date.now() - 1000 * 60 * 55).toISOString(),
  },
  {
    id: "ds-005",
    name: "Life Alert Pendant",
    type: "fall_detection",
    provider: "Life Alert",
    connected: false,
    lastSync: new Date(Date.now() - 1000 * 60 * 60 * 26).toISOString(),
  },
];

const DATA_SOURCES_ROBERT: DataSource[] = [
  {
    id: "ds-006",
    name: "MyChart — UCSF Health",
    type: "ehr",
    provider: "MyChart",
    connected: true,
    lastSync: new Date(Date.now() - 1000 * 60 * 180).toISOString(),
  },
  {
    id: "ds-007",
    name: "Fitbit Sense 2",
    type: "wearable",
    provider: "Fitbit",
    connected: true,
    lastSync: new Date(Date.now() - 1000 * 60 * 30).toISOString(),
  },
  {
    id: "ds-008",
    name: "Nest Indoor Camera",
    type: "camera",
    provider: "Google Nest",
    connected: true,
    lastSync: new Date(Date.now() - 1000 * 60 * 15).toISOString(),
  },
  {
    id: "ds-009",
    name: "Medical Guardian Elite",
    type: "fall_detection",
    provider: "Medical Guardian",
    connected: true,
    lastSync: new Date(Date.now() - 1000 * 60 * 45).toISOString(),
  },
];

const DATA_SOURCES_MARGARET: DataSource[] = [
  {
    id: "ds-010",
    name: "MyChart — Kaiser Permanente",
    type: "ehr",
    provider: "MyChart",
    connected: true,
    lastSync: new Date(Date.now() - 1000 * 60 * 15).toISOString(),
  },
  {
    id: "ds-011",
    name: "Apple Watch SE",
    type: "wearable",
    provider: "Apple Health",
    connected: true,
    lastSync: new Date(Date.now() - 1000 * 60 * 10).toISOString(),
  },
  {
    id: "ds-012",
    name: "Ring Indoor Camera",
    type: "camera",
    provider: "Ring",
    connected: true,
    lastSync: new Date(Date.now() - 1000 * 60 * 20).toISOString(),
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 5: SEED DATA — CARE TEAM
// ─────────────────────────────────────────────────────────────────────────────

const CARE_TEAM_ELEANOR: CareTeamMember[] = [
  {
    id: "ct-001",
    name: "Dr. Sarah Kim",
    role: "Primary Care Physician",
    organization: "Stanford Health Care",
    phone: "(650) 555-0200",
    email: "s.kim@stanfordhealthcare.org",
  },
  {
    id: "ct-002",
    name: "Dr. Alan Patel",
    role: "Neurologist",
    organization: "Stanford Memory Center",
    phone: "(650) 555-0201",
    email: "a.patel@stanfordhealthcare.org",
  },
  {
    id: "ct-003",
    name: "Rosa Martinez",
    role: "Home Health Aide",
    organization: "BrightHome Care Agency",
    phone: "(650) 555-0177",
    email: "rosa.m@brighthomecare.com",
  },
];

const CARE_TEAM_ROBERT: CareTeamMember[] = [
  {
    id: "ct-004",
    name: "Dr. Thomas Wu",
    role: "Cardiologist",
    organization: "UCSF Medical Center",
    phone: "(415) 555-0300",
    email: "t.wu@ucsf.edu",
  },
  {
    id: "ct-005",
    name: "Dr. Jennifer Ross",
    role: "Primary Care Physician",
    organization: "Palo Alto Medical Foundation",
    phone: "(650) 555-0301",
    email: "j.ross@pamf.org",
  },
  {
    id: "ct-006",
    name: "David Nguyen",
    role: "Physical Therapist",
    organization: "RehabCare Partners",
    phone: "(650) 555-0302",
    email: "d.nguyen@rehabcarepartners.com",
  },
];

const CARE_TEAM_MARGARET: CareTeamMember[] = [
  {
    id: "ct-007",
    name: "Dr. Lisa Chang",
    role: "Primary Care Physician",
    organization: "Kaiser Permanente San Jose",
    phone: "(408) 555-0400",
    email: "l.chang@kp.org",
  },
  {
    id: "ct-008",
    name: "Dr. Robert Stein",
    role: "Geriatric Specialist",
    organization: "Kaiser Permanente San Jose",
    phone: "(408) 555-0401",
    email: "r.stein@kp.org",
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 6: SEED DATA — ALERTS
// ─────────────────────────────────────────────────────────────────────────────

export const MOCK_ALERTS: Alert[] = [
  // ── CRITICAL ──────────────────────────────────────────────────────────────

  {
    id: "alert-001",
    seniorId: "senior-002",
    seniorName: "Robert Chen",
    type: "blood_pressure",
    category: "cardiovascular",
    severity: "critical",
    title: "Blood pressure above personal threshold — 3rd consecutive morning",
    description: "Systolic reading of 178 mmHg at 6:42 AM, exceeding Robert's 160 mmHg personal threshold.",
    aiExplanation:
      "Robert's systolic BP hit 178/94 this morning — his third consecutive reading above his personal 160 mmHg threshold. His UCSF cardiologist should be contacted today.",
    timestamp: new Date(Date.now() - 1000 * 60 * 120).toISOString(),
    status: "active",
    actionTaken: null,
    resolvedBy: null,
    resolvedAt: null,
    personalThresholdApplied: true,
    patternAlert: true,
    contextSuppressible: false,
    suppressedBy: null,
  },
  {
    id: "alert-002",
    seniorId: "senior-001",
    seniorName: "Eleanor Yang",
    type: "fall_device_offline",
    category: "falls_safety",
    severity: "critical",
    title: "Fall detection pendant offline for 26+ hours",
    description: "Life Alert pendant last communicated at 8:15 PM yesterday. Fall detection is currently inactive.",
    aiExplanation:
      "Eleanor's Life Alert pendant has been offline for 26 hours — fall detection is not active. Ring camera shows she is moving normally, but the device must be reconnected today.",
    timestamp: new Date(Date.now() - 1000 * 60 * 60 * 26).toISOString(),
    status: "acknowledged",
    actionTaken: "Rosa (home aide) will check device on next visit at 3:00 PM today",
    resolvedBy: null,
    resolvedAt: null,
    personalThresholdApplied: false,
    patternAlert: false,
    contextSuppressible: false,
    suppressedBy: null,
  },

  // ── MODERATE ──────────────────────────────────────────────────────────────

  {
    id: "alert-003",
    seniorId: "senior-002",
    seniorName: "Robert Chen",
    type: "vitals_trending",
    category: "vitals_trending",
    severity: "moderate",
    title: "Resting heart rate elevated 16 bpm above baseline for 2 nights",
    description: "Average overnight HR of 88 bpm vs Robert's 72 bpm 30-day baseline.",
    aiExplanation:
      "Robert's Fitbit recorded 88 bpm resting overnight — 16 bpm above his personal 72 bpm baseline for the second consecutive night. Combined with elevated BP, this pattern warrants a call to his care team within 24 hours.",
    timestamp: new Date(Date.now() - 1000 * 60 * 60 * 8).toISOString(),
    status: "active",
    actionTaken: null,
    resolvedBy: null,
    resolvedAt: null,
    personalThresholdApplied: true,
    patternAlert: true,
    contextSuppressible: false,
    suppressedBy: null,
  },
  {
    id: "alert-004",
    seniorId: "senior-003",
    seniorName: "Margaret Sullivan",
    type: "sleep_duration",
    category: "sleep",
    severity: "moderate",
    title: "Sleep below 5.5 hours for 5 consecutive nights",
    description: "Averaging 5.4 hours over the past 5 nights against her 6.8-hour baseline.",
    aiExplanation:
      "Margaret has slept an average of 5.4 hours for 5 straight nights, well below her 6.8-hour baseline. Early waking between 4:30–5:15 AM each day may signal mood or cognitive shifts worth discussing with Dr. Stein.",
    timestamp: new Date(Date.now() - 1000 * 60 * 60 * 12).toISOString(),
    status: "active",
    actionTaken: null,
    resolvedBy: null,
    resolvedAt: null,
    personalThresholdApplied: true,
    patternAlert: true,
    contextSuppressible: true,
    suppressedBy: null,
  },
  {
    id: "alert-005",
    seniorId: "senior-001",
    seniorName: "Eleanor Yang",
    type: "medication_late",
    category: "medication",
    severity: "moderate",
    title: "Afternoon metformin missed — 2nd time this week",
    description: "MedMinder did not log Eleanor's 2:00 PM metformin dose. Morning dose confirmed at 8:14 AM.",
    aiExplanation:
      "Eleanor's 2pm metformin dose has been missed two days in a row. This matters because consistent afternoon dosing controls her post-lunch glucose spike.",
    timestamp: new Date(Date.now() - 1000 * 60 * 55).toISOString(),
    status: "acknowledged",
    actionTaken: "Check-in call scheduled for 4:00 PM by Becca Yang",
    resolvedBy: null,
    resolvedAt: null,
    personalThresholdApplied: false,
    patternAlert: true,
    contextSuppressible: true,
    suppressedBy: null,
  },
  {
    id: "alert-006",
    seniorId: "senior-003",
    seniorName: "Margaret Sullivan",
    type: "appointment_upcoming_48h",
    category: "appointment",
    severity: "moderate",
    title: "Geriatric specialist appointment in 48 hours",
    description: "Dr. Stein at Kaiser Permanente San Jose — Thursday 2:30 PM. Health trends prepared.",
    aiExplanation:
      "Margaret's appointment with Dr. Stein is in 48 hours. NartheCare has flagged her 5-night sleep deficit and 22% activity decline as key data points to bring to this visit.",
    timestamp: new Date(Date.now() - 1000 * 60 * 60 * 6).toISOString(),
    status: "active",
    actionTaken: null,
    resolvedBy: null,
    resolvedAt: null,
    personalThresholdApplied: false,
    patternAlert: false,
    contextSuppressible: true,
    suppressedBy: null,
  },

  // ── LOW ───────────────────────────────────────────────────────────────────

  {
    id: "alert-007",
    seniorId: "senior-003",
    seniorName: "Margaret Sullivan",
    type: "best_sleep_week",
    category: "positive_signal",
    severity: "low",
    title: "Best sleep quality week in the past 30 days",
    description: "Margaret averaged 7.1 hours with minimal wake events over the past 7 nights.",
    aiExplanation:
      "Margaret's sleep quality this week is the best recorded in 30 days — 7.1 average hours with few disruptions. This is worth noting at Thursday's appointment as a positive baseline.",
    timestamp: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString(),
    status: "active",
    actionTaken: null,
    resolvedBy: null,
    resolvedAt: null,
    personalThresholdApplied: false,
    patternAlert: true,
    contextSuppressible: true,
    suppressedBy: null,
  },
  {
    id: "alert-008",
    seniorId: "senior-001",
    seniorName: "Eleanor Yang",
    type: "wearable_battery_low",
    category: "device_connectivity",
    severity: "low",
    title: "Apple Watch battery at 8% — sync may be disrupted",
    description: "Eleanor's Apple Watch reported 8% battery as of 11:30 AM. Charging reminder recommended.",
    aiExplanation:
      "Eleanor's Apple Watch is at 8% battery, which may interrupt heart rate and activity logging later today. A reminder to charge should be sent before her afternoon routine.",
    timestamp: new Date(Date.now() - 1000 * 60 * 30).toISOString(),
    status: "active",
    actionTaken: null,
    resolvedBy: null,
    resolvedAt: null,
    personalThresholdApplied: false,
    patternAlert: false,
    contextSuppressible: true,
    suppressedBy: null,
  },
  {
    id: "alert-009",
    seniorId: "senior-001",
    seniorName: "Eleanor Yang",
    type: "routine_variation",
    category: "routine",
    severity: "low",
    title: "Morning kitchen activity started 90 minutes later than usual",
    description: "Ring camera first detected Eleanor in the kitchen at 8:45 AM vs her typical 7:15 AM.",
    aiExplanation:
      "Eleanor's morning kitchen activity was 90 minutes later than her established pattern today. Her heart rate and movement data show normal rest, suggesting she simply slept in.",
    timestamp: new Date(Date.now() - 1000 * 60 * 60 * 4).toISOString(),
    status: "resolved",
    actionTaken: "Rosa confirmed Eleanor slept in — no concern",
    resolvedBy: "Rosa Martinez",
    resolvedAt: new Date(Date.now() - 1000 * 60 * 60 * 3).toISOString(),
    personalThresholdApplied: false,
    patternAlert: false,
    contextSuppressible: true,
    suppressedBy: null,
  },
  {
    id: "alert-010",
    seniorId: "senior-003",
    seniorName: "Margaret Sullivan",
    type: "appointment_upcoming_week",
    category: "upcoming_items",
    severity: "low",
    title: "Follow-up bone density scan in 6 days",
    description: "Radiography appointment at Kaiser San Jose on Monday at 10:00 AM. Transport may be needed.",
    aiExplanation:
      "Margaret's bone density follow-up is in 6 days — relevant given her osteoporosis diagnosis. Confirming transport and reviewing any prep instructions now avoids a last-minute scramble.",
    timestamp: new Date(Date.now() - 1000 * 60 * 60 * 10).toISOString(),
    status: "active",
    actionTaken: null,
    resolvedBy: null,
    resolvedAt: null,
    personalThresholdApplied: false,
    patternAlert: false,
    contextSuppressible: true,
    suppressedBy: null,
  },
  {
    id: "alert-011",
    seniorId: "senior-002",
    seniorName: "Robert Chen",
    type: "phone_activity_low",
    category: "social_behavioral",
    severity: "low",
    title: "Phone call activity significantly below usual for 3 days",
    description: "Robert typically makes or receives 4–6 calls per day. This week's average is under 1.",
    aiExplanation:
      "Robert's phone call activity has dropped sharply this week — under 1 call per day vs his usual 4–6. Social withdrawal can be an early sign of mood changes worth a gentle check-in.",
    timestamp: new Date(Date.now() - 1000 * 60 * 60 * 14).toISOString(),
    status: "active",
    actionTaken: null,
    resolvedBy: null,
    resolvedAt: null,
    personalThresholdApplied: false,
    patternAlert: true,
    contextSuppressible: true,
    suppressedBy: null,
  },
  {
    id: "alert-012",
    seniorId: "senior-001",
    seniorName: "Eleanor Yang",
    type: "prescription_refill",
    category: "upcoming_items",
    severity: "low",
    title: "Metformin refill needed within 10 days",
    description: "Based on MedMinder dispense logs, Eleanor has approximately 10 days of metformin remaining.",
    aiExplanation:
      "Eleanor's MedMinder logs show roughly a 10-day supply of metformin left. Requesting a refill now prevents a gap in her diabetes management.",
    timestamp: new Date(Date.now() - 1000 * 60 * 60 * 18).toISOString(),
    status: "active",
    actionTaken: null,
    resolvedBy: null,
    resolvedAt: null,
    personalThresholdApplied: false,
    patternAlert: false,
    contextSuppressible: true,
    suppressedBy: null,
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 6.5: SEED DATA — ACTION PLANS
// ─────────────────────────────────────────────────────────────────────────────

export const MOCK_ACTION_PLANS: ActionPlan[] = [
  {
    id: "plan-001",
    seniorId: "senior-002",
    seniorName: "Robert Chen",
    linkedAlertIds: ["alert-001"],
    title: "Blood Pressure Management Plan",
    summary:
      "Robert's systolic BP has exceeded 160 mmHg on multiple consecutive readings. This plan outlines steps to stabilize his blood pressure, reduce cardiovascular risk, and improve monitoring frequency.",
    generatedAt: new Date(Date.now() - 1000 * 60 * 60 * 3).toISOString(),
    status: "open",
    chosenOptionLevel: null,
    caregiverNotes: "",
    immediateActions: [
      {
        level: "standard",
        title: "Daily BP Logging + Medication Review",
        description:
          "Begin recording blood pressure twice daily (morning and evening) using the existing wrist cuff. Contact Robert's primary care physician to review current antihypertensive medication dosage and confirm compliance.",
        estimatedCost: "$0 – uses existing equipment",
        timeToComplete: "1–2 days to implement",
        difficulty: "easy",
      },
      {
        level: "better",
        title: "Remote-Connected BP Monitor + Nurse Check-in",
        description:
          "Replace wrist cuff with a Bluetooth-enabled arm cuff (e.g., Omron Evolv) that auto-syncs readings to the NartheCare platform. Schedule a telehealth nurse check-in within 48 hours to assess symptoms and adjust care plan.",
        estimatedCost: "$60–$90 for device; telehealth visit may be covered by Medicare",
        timeToComplete: "3–5 days",
        difficulty: "moderate",
      },
      {
        level: "best",
        title: "Cardiology Referral + Dietary & Medication Optimization",
        description:
          "Refer Robert to a cardiologist for a comprehensive evaluation. Engage a registered dietitian to design a low-sodium DASH diet plan. Coordinate pharmacy review for potential medication interactions. Consider ambulatory BP monitoring over 24 hours.",
        estimatedCost: "$150–$400 depending on insurance; specialist copays vary",
        timeToComplete: "1–3 weeks for full program",
        difficulty: "involved",
      },
    ],
    financialConsiderations:
      "Medicare Part B covers ambulatory blood pressure monitoring if ordered by a physician. Telehealth nurse visits are typically covered under Medicare Advantage plans. A connected BP monitor qualifies as a durable medical expense and may be HSA-eligible. Dietitian visits (up to 3 per year) are covered under Medicare for diabetes or kidney disease; otherwise expect $80–$120/session without coverage.",
    resources: [
      {
        type: "professional",
        name: "Peninsula Cardiology Associates",
        description: "In-network cardiology group accepting Medicare patients",
        estimatedCost: "$30–$50 specialist copay (Medicare Advantage)",
        contactOrLink: "(650) 555-0182",
        localToSenior: true,
      },
      {
        type: "device",
        name: "Omron Evolv Wireless BP Monitor",
        description: "FDA-cleared, arm-based, syncs via Bluetooth to health apps",
        estimatedCost: "$69–$89",
        contactOrLink: "omron-healthcare.com",
        localToSenior: false,
      },
      {
        type: "service",
        name: "DASH Diet Coaching (Medicare-covered)",
        description:
          "Phone-based dietitian program through SilverSneakers health coaching",
        estimatedCost: "$0 for eligible Medicare Advantage members",
        contactOrLink: "silversneakers.com/healthy-living",
        localToSenior: false,
      },
      {
        type: "insurance",
        name: "Medicare Advantage Telehealth Line",
        description: "24/7 nurse line for urgent health questions and triage",
        estimatedCost: "$0 (included in plan)",
        contactOrLink: "1-800-555-0144",
        localToSenior: false,
      },
    ],
  },
  {
    id: "plan-002",
    seniorId: "senior-001",
    seniorName: "Eleanor Yang",
    linkedAlertIds: ["alert-002"],
    title: "Fall Prevention & Device Restoration Plan",
    summary:
      "Eleanor's fall detection device has been offline for over 12 hours, leaving a critical safety gap. This plan covers immediate device restoration and longer-term fall-risk reduction strategies for her home environment.",
    generatedAt: new Date(Date.now() - 1000 * 60 * 60 * 6).toISOString(),
    status: "in_progress",
    chosenOptionLevel: "better",
    caregiverNotes:
      "Spoke with Eleanor's daughter — she will stop by tonight to check the device. Scheduling a home safety visit for next week.",
    immediateActions: [
      {
        level: "standard",
        title: "Restore Fall Detection Device",
        description:
          "Have a family member or caregiver visit Eleanor today to inspect the fall detection pendant or sensor. Check power, connectivity, and placement. Reboot the hub and confirm sync with the NartheCare platform before leaving.",
        estimatedCost: "$0",
        timeToComplete: "Same day",
        difficulty: "easy",
      },
      {
        level: "better",
        title: "Device Restoration + Professional Home Safety Assessment",
        description:
          "Restore the device as above, then schedule an occupational therapist home visit to identify fall hazards (rugs, lighting, bathroom grab bars). Implement OT recommendations within 2 weeks.",
        estimatedCost: "$0–$150 for OT visit (often covered by Medicare Part B)",
        timeToComplete: "1–2 weeks",
        difficulty: "moderate",
      },
      {
        level: "best",
        title: "Full Fall-Risk Program with Backup Detection",
        description:
          "Restore primary device and add a secondary passive fall detection sensor (e.g., Bay Alarm Medical in-home sensor) as backup. Enroll Eleanor in a structured balance & strength program (e.g., Tai Chi for Arthritis, SilverSneakers). Complete full OT home modification assessment.",
        estimatedCost: "$200–$600 one-time; ongoing class fees $0–$30/month",
        timeToComplete: "2–4 weeks for full setup",
        difficulty: "involved",
      },
    ],
    financialConsiderations:
      "Medicare Part B covers occupational therapy evaluations when ordered by a physician (after deductible). Home modification grants may be available through local Area Agency on Aging — no income requirements for safety modifications. Bay Alarm Medical monthly monitoring plans start at $19.95/month. Some Medicare Advantage plans include fall-detection devices at no cost under supplemental benefits.",
    resources: [
      {
        type: "professional",
        name: "Coastside OT Home Safety Services",
        description:
          "Occupational therapist specializing in home fall-risk assessment for seniors",
        estimatedCost: "$0 with Medicare Part B referral",
        contactOrLink: "(415) 555-0237",
        localToSenior: true,
      },
      {
        type: "community",
        name: "Area Agency on Aging — Fall Prevention Program",
        description:
          "Free home safety checks and grab-bar installation for qualifying seniors",
        estimatedCost: "$0",
        contactOrLink: "aging.ca.gov/local-resources",
        localToSenior: true,
      },
      {
        type: "device",
        name: "Bay Alarm Medical In-Home Sensor",
        description:
          "Passive fall detection — no button press required, mounts on wall",
        estimatedCost: "$0 upfront + $19.95/month monitoring",
        contactOrLink: "bayalarmmedical.com",
        localToSenior: false,
      },
      {
        type: "service",
        name: "SilverSneakers Tai Chi for Balance",
        description:
          "Evidence-based balance program shown to reduce falls; available in-person and online",
        estimatedCost: "$0 for Medicare Advantage members",
        contactOrLink: "silversneakers.com/classes",
        localToSenior: false,
      },
    ],
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 7: SEED DATA — AI SUMMARIES
// ─────────────────────────────────────────────────────────────────────────────

export const MOCK_SUMMARIES: AISummary[] = [
  {
    id: "summary-001",
    seniorId: "senior-001",
    seniorName: "Eleanor Yang",
    generatedAt: new Date(Date.now() - 1000 * 60 * 60 * 8).toISOString(),
    summaryType: "daily",
    plainTextSummary:
      "Eleanor had a generally stable night with some sleep fragmentation. Her Apple Watch logged 6.2 hours of sleep with two brief wake periods around 2 AM and 4 AM — consistent with her recent pattern. Her morning blood glucose reading of 142 mg/dL is slightly elevated but within her acceptable range as defined in her Stanford care plan. The Ring camera showed normal morning activity: she was in the kitchen by 7:15 AM and moving around the house by 8:00 AM. Her 9:00 AM metformin dose was confirmed by the MedMinder dispenser. Her afternoon dose at 2:00 PM was not taken — this is the second time this week.",
    keyInsights: [
      "Sleep slightly fragmented but consistent with recent 2-week pattern",
      "Morning glucose at 142 mg/dL — within acceptable range, no intervention needed",
      "Morning routine on schedule — kitchen activity by 7:15 AM as expected",
      "Second missed afternoon medication dose this week — pattern emerging",
    ],
    recommendedActions: [
      "Monitor afternoon glucose given slightly elevated morning reading",
      "Check in about the missed 2:00 PM dose — may be napping at that time",
      "Consider asking Rosa to confirm afternoon dose on next visit",
    ],
    sourceTags: ["Apple Watch", "Ring Camera", "MedMinder", "MyChart — Stanford"],
    urgency: "attention",
  },
  {
    id: "summary-002",
    seniorId: "senior-002",
    seniorName: "Robert Chen",
    generatedAt: new Date(Date.now() - 1000 * 60 * 60 * 7).toISOString(),
    summaryType: "daily",
    plainTextSummary:
      "Robert's overnight vitals require attention today. His Fitbit recorded an elevated resting heart rate of 88 bpm overnight — well above his 30-day baseline of 72 bpm — and this morning's blood pressure reading of 178/94 exceeds his established threshold of 160/90. This is the third consecutive morning with an above-threshold systolic reading. His oxygen saturation remained normal at 96-97% throughout the night. The Nest camera shows he followed his normal morning routine, suggesting he is not experiencing acute distress, but the cardiovascular pattern warrants contact with his care team today. His UCSF cardiologist noted a similar trend in last month's visit notes.",
    keyInsights: [
      "Blood pressure 178/94 — third consecutive morning above personal threshold",
      "Resting heart rate elevated to 88 bpm overnight (baseline: 72 bpm)",
      "Oxygen saturation normal — no respiratory concern",
      "Morning routine appears normal per Nest camera",
    ],
    recommendedActions: [
      "Contact Dr. Thomas Wu (cardiologist) at UCSF today — (415) 555-0300",
      "Confirm Robert has taken his morning blood pressure medication",
      "Ask about sodium intake and activity level over the past 3 days",
      "Schedule follow-up blood pressure check for tomorrow morning",
    ],
    sourceTags: ["Fitbit Sense 2", "Google Nest", "MyChart — UCSF"],
    urgency: "urgent",
  },
  {
    id: "summary-003",
    seniorId: "senior-003",
    seniorName: "Margaret Sullivan",
    generatedAt: new Date(Date.now() - 1000 * 60 * 60 * 6).toISOString(),
    summaryType: "daily",
    plainTextSummary:
      "Margaret had a quiet and largely routine day. Her Apple Watch logged 5.4 hours of sleep — her fifth consecutive night below her 6.8-hour baseline. She was active by 6:45 AM, which is earlier than her usual 7:30 AM routine, consistent with the early waking pattern NartheCare has flagged this week. Her vitals throughout the day were normal: resting heart rate averaged 71 bpm, blood pressure 128/78 via her Kaiser chart. She completed 34 minutes of activity in the afternoon. Ring camera shows she received a visitor at 2:30 PM for approximately 90 minutes. Her MyChart shows no new clinical notes since her last visit on the 14th.",
    keyInsights: [
      "Sleep averaging 5.4 hours — 5 consecutive nights below her 6.8-hour baseline",
      "Early waking pattern (4:30-5:15 AM) persisting — worth flagging to Dr. Stein",
      "Vitals otherwise stable — heart rate and blood pressure within normal range",
      "Activity levels slightly below her monthly average",
    ],
    recommendedActions: [
      "Bring sleep pattern data to Thursday's appointment with Dr. Stein",
      "Ask Margaret about the early waking — is she feeling anxious or having vivid dreams?",
      "NartheCare will prepare a sleep trend summary for Dr. Stein's review",
    ],
    sourceTags: ["Apple Watch", "Ring Camera", "MyChart — Kaiser"],
    urgency: "attention",
  },
  {
    id: "summary-004",
    seniorId: "senior-002",
    seniorName: "Robert Chen",
    generatedAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 3).toISOString(),
    summaryType: "post_visit",
    plainTextSummary:
      "Following Robert's cardiology appointment with Dr. Wu at UCSF on Monday, NartheCare has updated his monitoring parameters based on the visit notes now available in MyChart. Dr. Wu increased his lisinopril dosage from 10mg to 20mg daily and requested blood pressure monitoring twice daily for the next two weeks. He also recommended reducing sodium intake and increasing walking activity to at least 20 minutes per day. Robert's blood pressure readings since the appointment have been: Tuesday morning 168/88, Tuesday evening 162/86, Wednesday morning 172/90. The trend has not yet improved following the dosage change — this is expected within the first week but worth watching closely.",
    keyInsights: [
      "Lisinopril increased to 20mg — change effective from Monday",
      "Blood pressure monitoring now set to twice daily per Dr. Wu's instructions",
      "Post-change readings: 168/88, 162/86, 172/90 — improvement not yet visible",
      "Sodium reduction and 20-min daily walks recommended by Dr. Wu",
    ],
    recommendedActions: [
      "Confirm Robert is taking the new 20mg dose — check with James or Linda",
      "Encourage the daily 20-minute walk — Nest camera can help confirm activity",
      "If blood pressure does not trend down by Friday, Dr. Wu requested a call",
    ],
    sourceTags: ["MyChart — UCSF", "Fitbit Sense 2", "Google Nest"],
    urgency: "attention",
  },
  {
    id: "summary-005",
    seniorId: "senior-001",
    seniorName: "Eleanor Yang",
    generatedAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 7).toISOString(),
    summaryType: "weekly",
    plainTextSummary:
      "Eleanor's week was generally stable with one area of emerging concern. Her blood glucose levels remained within her acceptable range on 6 of 7 days, with one elevated reading of 161 mg/dL on Wednesday afternoon following lunch — within her personal caution threshold but worth noting. Sleep quality has been slightly fragmented throughout the week, averaging 6.1 hours per night with frequent brief wake periods in the early morning hours. Her dementia-related behavioral indicators tracked by NartheCare — routine consistency, kitchen activity timing, and response to her home aide — all remained stable and within her established baseline. The missed afternoon medication doses are the primary pattern to address going into next week.",
    keyInsights: [
      "Blood glucose stable on 6/7 days — one elevated reading Wednesday afternoon",
      "Sleep averaging 6.1 hours — below her 7.2-hour weekly target",
      "Dementia behavioral indicators stable — routine consistent all week",
      "Missed afternoon medication doses on Tuesday and Thursday",
    ],
    recommendedActions: [
      "Ask Rosa to remind Eleanor about the 2:00 PM dose on her three weekly visits",
      "Consider requesting a timing adjustment from Dr. Kim if afternoon dosing is consistently problematic",
      "Weekly summary PDF prepared for your records — available in Documents",
    ],
    sourceTags: ["Apple Watch", "Ring Camera", "MedMinder", "MyChart — Stanford"],
    urgency: "routine",
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 8: SEED DATA — APPOINTMENTS
// ─────────────────────────────────────────────────────────────────────────────

export const MOCK_APPOINTMENTS: Appointment[] = [
  {
    id: "appt-001",
    seniorId: "senior-003",
    seniorName: "Margaret Sullivan",
    title: "Geriatric Specialist — Routine Follow-up",
    provider: "Dr. Robert Stein",
    location: "Kaiser Permanente San Jose, 250 Hospital Parkway",
    dateTime: new Date(Date.now() + 1000 * 60 * 60 * 48).toISOString(),
    notes:
      "Bring updated sleep data and activity report. Dr. Stein requested cognitive assessment update.",
  },
  {
    id: "appt-002",
    seniorId: "senior-002",
    seniorName: "Robert Chen",
    title: "Cardiology — Blood Pressure Follow-up",
    provider: "Dr. Thomas Wu",
    location: "UCSF Medical Center, 505 Parnassus Ave, San Francisco",
    dateTime: new Date(Date.now() + 1000 * 60 * 60 * 24 * 10).toISOString(),
    notes:
      "Two-week post-dosage-change check. Bring blood pressure log from NartheCare.",
  },
  {
    id: "appt-003",
    seniorId: "senior-001",
    seniorName: "Eleanor Yang",
    title: "Primary Care — Quarterly Diabetes Review",
    provider: "Dr. Sarah Kim",
    location: "Stanford Health Care, 300 Pasteur Drive, Palo Alto",
    dateTime: new Date(Date.now() + 1000 * 60 * 60 * 24 * 21).toISOString(),
    notes: "Bring 30-day glucose trend report. Medication review scheduled.",
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 9: SEED DATA — SENIORS (assembled from above)
// ─────────────────────────────────────────────────────────────────────────────

export const MOCK_SENIORS: Senior[] = [
  {
    id: "senior-001",
    name: "Eleanor Yang",
    age: 78,
    photo: null,
    primaryConditions: ["Type 2 Diabetes", "Early-stage Dementia"],
    location: "Sunnyvale, CA",
    status: "monitor",
    lastSeen: new Date(Date.now() - 1000 * 60 * 47).toISOString(),
    caregivers: CAREGIVERS_ELEANOR,
    dataSources: DATA_SOURCES_ELEANOR,
    vitals: generateVitalsHistory("senior-001", 72, 132, 82),
    alerts: MOCK_ALERTS.filter((a) => a.seniorId === "senior-001"),
    summaries: MOCK_SUMMARIES.filter((s) => s.seniorId === "senior-001"),
    careTeam: CARE_TEAM_ELEANOR,
  },
  {
    id: "senior-002",
    name: "Robert Chen",
    age: 82,
    photo: null,
    primaryConditions: ["Congestive Heart Failure", "Hypertension"],
    location: "Palo Alto, CA",
    status: "alert",
    lastSeen: new Date(Date.now() - 1000 * 60 * 180).toISOString(),
    caregivers: CAREGIVERS_ROBERT,
    dataSources: DATA_SOURCES_ROBERT,
    vitals: generateVitalsHistory("senior-002", 80, 158, 90),
    alerts: MOCK_ALERTS.filter((a) => a.seniorId === "senior-002"),
    summaries: MOCK_SUMMARIES.filter((s) => s.seniorId === "senior-002"),
    careTeam: CARE_TEAM_ROBERT,
  },
  {
    id: "senior-003",
    name: "Margaret Sullivan",
    age: 74,
    photo: null,
    primaryConditions: ["Mild Cognitive Impairment", "Osteoporosis"],
    location: "San Jose, CA",
    status: "stable",
    lastSeen: new Date(Date.now() - 1000 * 60 * 15).toISOString(),
    caregivers: CAREGIVERS_MARGARET,
    dataSources: DATA_SOURCES_MARGARET,
    vitals: generateVitalsHistory("senior-003", 71, 128, 78),
    alerts: MOCK_ALERTS.filter((a) => a.seniorId === "senior-003"),
    summaries: MOCK_SUMMARIES.filter((s) => s.seniorId === "senior-003"),
    careTeam: CARE_TEAM_MARGARET,
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 10: SEED DATA — DASHBOARD STATS
// ─────────────────────────────────────────────────────────────────────────────

export const MOCK_DASHBOARD_STATS: DashboardStats = {
  activeSeniors: MOCK_SENIORS.length,
  alertsToday: MOCK_ALERTS.filter((a) => a.status === "active").length,
  upcomingAppointments: MOCK_APPOINTMENTS.filter(
    (a) => new Date(a.dateTime) > new Date()
  ).length,
  overallStatus: "needs_attention",
};

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 11: CONVENIENCE LOOKUPS
// Used by components that need to find a senior or alert by ID quickly
// ─────────────────────────────────────────────────────────────────────────────

export function getSeniorById(id: string): Senior | undefined {
  return MOCK_SENIORS.find((s) => s.id === id);
}

export function getAlertById(id: string): Alert | undefined {
  return MOCK_ALERTS.find((a) => a.id === id);
}

export function getSummariesBySenior(seniorId: string): AISummary[] {
  return MOCK_SUMMARIES.filter((s) => s.seniorId === seniorId);
}

export function getAlertsBySenior(seniorId: string): Alert[] {
  return MOCK_ALERTS.filter((a) => a.seniorId === seniorId);
}

export function getActiveAlerts(): Alert[] {
  return MOCK_ALERTS.filter((a) => a.status === "active");
}

export function getCriticalAlerts(): Alert[] {
  return MOCK_ALERTS.filter(
    (a) => a.severity === "critical" && a.status === "active"
  );
}

export function getAppointmentsBySenior(seniorId: string): Appointment[] {
  return MOCK_APPOINTMENTS.filter((a) => a.seniorId === seniorId);
}

export function getUpcomingAppointments(): Appointment[] {
  return MOCK_APPOINTMENTS.filter(
    (a) => new Date(a.dateTime) > new Date()
  ).sort(
    (a, b) => new Date(a.dateTime).getTime() - new Date(b.dateTime).getTime()
  );
}

export function getActionPlansBySenior(seniorId: string): ActionPlan[] {
  return MOCK_ACTION_PLANS.filter((p) => p.seniorId === seniorId);
}
