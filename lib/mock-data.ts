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
export type AlertType = "vitals" | "fall" | "medication" | "behavioral" | "appointment";
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
  severity: AlertSeverity;
  title: string;
  description: string;
  aiExplanation: string;
  timestamp: string;
  status: AlertStatus;
  actionTaken: string | null;
  resolvedBy: string | null;
  resolvedAt: string | null;
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
  {
    id: "alert-001",
    seniorId: "senior-002",
    seniorName: "Robert Chen",
    type: "vitals",
    severity: "critical",
    title: "Blood pressure elevated above personal threshold",
    description: "Systolic reading of 178 mmHg detected at 6:42 AM via Fitbit Sense 2.",
    aiExplanation:
      "Robert's blood pressure has been trending upward over the past 3 days, with this morning's reading of 178/94 exceeding his established personal threshold of 160/90. His cardiologist at UCSF noted a similar pattern in visit notes from last month and recommended monitoring closely. Two of his last four readings have been above threshold. This warrants same-day attention — a call to his care team or cardiologist is recommended.",
    timestamp: new Date(Date.now() - 1000 * 60 * 120).toISOString(),
    status: "active",
    actionTaken: null,
    resolvedBy: null,
    resolvedAt: null,
  },
  {
    id: "alert-002",
    seniorId: "senior-001",
    seniorName: "Eleanor Yang",
    type: "medication",
    severity: "moderate",
    title: "Afternoon medication dose not confirmed",
    description: "Smart dispenser did not log 2:00 PM metformin dose. Morning dose confirmed at 8:14 AM.",
    aiExplanation:
      "Eleanor's MedMinder dispenser shows her 2:00 PM metformin dose was not dispensed or confirmed. This is the second missed afternoon dose this week — Monday's 2:00 PM dose was also skipped. Her morning doses have been consistent every day. This pattern may indicate she is napping at that time or has changed her routine. A gentle check-in call is recommended before escalating — her blood glucose readings have remained within range so far.",
    timestamp: new Date(Date.now() - 1000 * 60 * 55).toISOString(),
    status: "acknowledged",
    actionTaken: "Check-in call scheduled for 4:00 PM by Becca Yang",
    resolvedBy: null,
    resolvedAt: null,
  },
  {
    id: "alert-003",
    seniorId: "senior-001",
    seniorName: "Eleanor Yang",
    type: "behavioral",
    severity: "low",
    title: "Unusual inactivity detected between 10 AM and 1 PM",
    description: "Ring camera and Apple Watch both show minimal movement for a 3-hour window this morning.",
    aiExplanation:
      "Eleanor's Apple Watch activity data and Ring indoor camera both show very low movement between 10:12 AM and 1:05 PM today. This is outside her typical pattern — she is usually most active in the late morning. Her heart rate remained steady at 68 bpm throughout, suggesting she was resting rather than unwell. This may simply be a rest day, but it is worth a quick check-in if you have not already spoken with her today.",
    timestamp: new Date(Date.now() - 1000 * 60 * 60 * 3).toISOString(),
    status: "acknowledged",
    actionTaken: "Rosa (home aide) confirmed Eleanor napped — she had a poor night's sleep",
    resolvedBy: "Rosa Martinez",
    resolvedAt: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString(),
  },
  {
    id: "alert-004",
    seniorId: "senior-003",
    seniorName: "Margaret Sullivan",
    type: "appointment",
    severity: "low",
    title: "Upcoming neurology appointment in 48 hours",
    description: "Dr. Stein appointment scheduled for Thursday at 2:30 PM at Kaiser Permanente San Jose.",
    aiExplanation:
      "Margaret has a geriatric specialist appointment with Dr. Robert Stein in 48 hours. Based on her recent MyChart notes and Apple Watch data, there are three things worth bringing to this appointment: her sleep has averaged 5.4 hours over the past week (down from her 6.8 hour baseline), she has had two episodes of elevated heart rate above 105 bpm in the past 10 days, and her activity levels have declined 22% compared to last month. A summary of these trends has been prepared for you to share with Dr. Stein.",
    timestamp: new Date(Date.now() - 1000 * 60 * 60 * 6).toISOString(),
    status: "active",
    actionTaken: null,
    resolvedBy: null,
    resolvedAt: null,
  },
  {
    id: "alert-005",
    seniorId: "senior-002",
    seniorName: "Robert Chen",
    type: "vitals",
    severity: "moderate",
    title: "Resting heart rate elevated overnight",
    description: "Average overnight heart rate of 88 bpm, above his 72 bpm baseline.",
    aiExplanation:
      "Robert's Fitbit recorded an average resting heart rate of 88 bpm between 11 PM and 6 AM — significantly above his 30-day baseline of 72 bpm. Elevated resting heart rate can be an early indicator of cardiovascular stress, dehydration, or infection. Combined with this morning's blood pressure reading, this pattern warrants attention from his cardiologist. His oxygen saturation remained normal at 96-97% throughout the night.",
    timestamp: new Date(Date.now() - 1000 * 60 * 60 * 8).toISOString(),
    status: "active",
    actionTaken: null,
    resolvedBy: null,
    resolvedAt: null,
  },
  {
    id: "alert-006",
    seniorId: "senior-003",
    seniorName: "Margaret Sullivan",
    type: "vitals",
    severity: "low",
    title: "Sleep duration below baseline for 5 consecutive nights",
    description: "Average of 5.4 hours over the past 5 nights, compared to her 6.8 hour 30-day baseline.",
    aiExplanation:
      "Margaret's sleep has been consistently shorter than her baseline for the past 5 nights. Her Apple Watch shows she is going to bed at her usual time but waking earlier than normal — between 4:30 AM and 5:15 AM each day. This pattern of early waking can sometimes be associated with mood changes or cognitive shifts in individuals with mild cognitive impairment. It is worth mentioning to Dr. Stein at Thursday's appointment.",
    timestamp: new Date(Date.now() - 1000 * 60 * 60 * 12).toISOString(),
    status: "active",
    actionTaken: null,
    resolvedBy: null,
    resolvedAt: null,
  },
  {
    id: "alert-007",
    seniorId: "senior-001",
    seniorName: "Eleanor Yang",
    type: "fall",
    severity: "critical",
    title: "Possible fall detected — Life Alert not responding",
    description: "Life Alert pendant offline for 26 hours. Last known status: active.",
    aiExplanation:
      "Eleanor's Life Alert fall detection pendant has been offline for approximately 26 hours. The device last communicated at 8:15 PM yesterday. Ring camera activity shows Eleanor has been moving normally throughout the house today, which is reassuring — however the pendant should be reconnected as soon as possible. She may have removed it, placed it in a drawer, or the battery may need charging. This is flagged as critical because fall detection is offline, not because a fall has been detected.",
    timestamp: new Date(Date.now() - 1000 * 60 * 60 * 26).toISOString(),
    status: "acknowledged",
    actionTaken: "Rosa (home aide) will check device on next visit at 3:00 PM today",
    resolvedBy: null,
    resolvedAt: null,
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
