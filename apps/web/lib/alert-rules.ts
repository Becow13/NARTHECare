// /lib/alert-rules.ts
// NartheCare — Alert Severity Taxonomy & Governing Rules
// Defines the canonical alert type→severity mappings and rule constants.
// Used by the alert engine (future) and as documentation for the mock layer.

// ─────────────────────────────────────────────────────────────────────────────
// SEVERITY TAXONOMY
// ─────────────────────────────────────────────────────────────────────────────

export const CRITICAL_ALERT_RULES = {
  fallsAndSafety: [
    "fall_detected",           // Fall detected by pendant or camera
    "inactivity",              // Care Member has not moved for unusually long during waking hours
    "fall_device_offline",     // Fall detection device offline >24h with no explanation
    "wandering",               // Door/exit sensor at unusual hour suggesting wandering
    "camera_night_motion",     // Camera detects motion during caregiver-defined sleep hours
  ],
  cardiovascular: [
    "blood_pressure",          // BP above personal systolic threshold (default 160) or below 90 systolic
    "heart_rate",              // HR above 120 bpm or below 50 bpm at rest
    "irregular_rhythm",        // Irregular heart rhythm detected by wearable
    "oxygen_saturation",       // SpO2 below 92%
  ],
  medication: [
    "medication_missed_critical", // Missed dose of critical medication >24h
    "medication_double_dose",     // Double or missed dose detected by smart dispenser
  ],
  behavioralDementia: [
    "dementia_no_activity",    // Complete absence of kitchen/living area activity for a full waking day
  ],
  deviceAndData: [
    "all_devices_offline",     // All connected devices offline simultaneously >12h
    "gps_unusual_location",    // GPS device in unfamiliar location >6h
    "gps_not_home_overnight",  // GPS not at home address during sleep hours 12am–6am
  ],
} as const

export const MODERATE_ALERT_RULES = {
  vitalsTrending: [
    "vitals_trending",         // BP elevated 3+ consecutive days below critical threshold
    "heart_rate",              // Resting HR elevated >15 bpm above baseline for 2+ days
    "oxygen_saturation",       // SpO2 consistently 92–95%
    "weight_change",           // Weight change >3 lbs in 24h
  ],
  sleep: [
    "sleep_duration",          // Sleep <5h for 3+ consecutive nights
    "sleep_pattern",           // Significant increase in nighttime wake periods vs baseline
    "sleep_schedule",          // Sleep schedule shifted >2h from established pattern
  ],
  medication: [
    "medication_late",         // Critical medications taken 3+ hours late regularly
    "medication_double_dose",  // Doubled/missed doses for 2+ consecutive days
  ],
  activityAndMobility: [
    "activity_declined",       // Activity declined >40% vs 30-day baseline for 3+ days
    "no_outdoor_activity",     // No outdoor activity for a week (Care Member normally goes out daily)
  ],
  appointment: [
    "appointment_upcoming_48h", // Upcoming appointment within 48h with health data to bring
    "appointment_missed",       // Missed appointment not rescheduled within 48h
  ],
  nutritionAndHydration: [
    "no_kitchen_activity",     // No kitchen activity during normal meal times >1 day
    "fridge_no_interaction",   // Smart fridge/pantry sensor no interaction for unusual period
  ],
} as const

export const LOW_ALERT_RULES = {
  routineObservations: [
    "routine_variation",       // Minor variation from daily routine that resolves within hours
    "sleep_slightly_low",      // Sleep slightly below baseline for 1–2 nights
    "activity_slightly_low",   // Activity slightly lower than average for the day
  ],
  upcomingItems: [
    "appointment_upcoming_week", // Appointment in 5–7 days worth preparing for
    "prescription_refill",       // Prescription refill likely needed within 2 weeks
    "wellness_visit_due",        // Annual wellness visit due within the next month
  ],
  positiveSignals: [
    "activity_above_baseline",        // Care Member more active than usual above personal baseline
    "best_sleep_week",                // Best sleep week in the past 30 days
    "medication_adherence_streak",    // Consistent medication adherence for 7 consecutive days
  ],
  deviceAndConnectivity: [
    "device_not_synced",       // Non-critical data source has not synced in 24h
    "wearable_battery_low",    // Wearable battery low
  ],
  socialAndBehavioral: [
    "visitor_detected",        // Visitor detected by camera
    "phone_activity_low",      // Phone call activity significantly lower than usual
    "tv_pattern_changed",      // TV or device activity pattern changed
  ],
} as const

// ─────────────────────────────────────────────────────────────────────────────
// GOVERNING RULES
// ─────────────────────────────────────────────────────────────────────────────

export const ALERT_RULES = {
  personalThresholds: {
    description:
      "Alert thresholds are set per Care Member, not population averages. Each Care Member has their own " +
      "bloodPressureSysThreshold, heartRateMax, heartRateMin, oxygenSatMin, and " +
      "weightChangeThreshold stored in their profile.",
    defaultBloodPressureSysThreshold: 160,
    defaultHeartRateMax: 120,
    defaultHeartRateMin: 50,
    defaultOxygenSatMin: 92,
    defaultWeightChangeLbs: 3,
  },
  patternOverSingleReading: {
    description:
      "Single readings trigger low or moderate at most. " +
      "Three or more consecutive readings trigger the next severity level.",
    consecutiveDaysForEscalation: 3,
  },
  caregiverFatigue: {
    description:
      "Target 2–4 meaningful alerts per Care Member per day. " +
      "Weight distribution: low 70%, moderate 25%, critical 5%.",
    targetDailyAlertsPerSenior: 3,
    maxDailyAlertsPerSenior: 6,
  },
  contextSuppression: {
    description:
      "If a care team member logs a check-in confirming the Care Member is fine, " +
      "alerts triggered within the following window are suppressed.",
    suppressionWindowMinutes: 120,
  },
  aiExplanationRequired: {
    description:
      "Every alert must include a plain language AI explanation. Maximum 2 sentences. " +
      "Must reference the specific Care Member by name, the specific reading or pattern, " +
      "and why it matters for this individual.",
    maxSentences: 2,
    mustIncludeseniorName: true,
    mustIncludeSpecificReading: true,
  },
} as const

// ─────────────────────────────────────────────────────────────────────────────
// CATEGORY → DISPLAY LABEL MAP
// ─────────────────────────────────────────────────────────────────────────────

export const ALERT_CATEGORY_LABELS: Record<string, string> = {
  falls_safety:       "Falls & Safety",
  cardiovascular:     "Cardiovascular",
  medication:         "Medication",
  behavioral:         "Behavioral",
  device_data:        "Device & Data",
  vitals_trending:    "Vitals Trending",
  sleep:              "Sleep",
  activity_mobility:  "Activity",
  appointment:        "Appointment",
  nutrition:          "Nutrition",
  routine:            "Routine",
  upcoming_items:     "Upcoming",
  positive_signal:    "Positive",
  device_connectivity:"Device",
  social_behavioral:  "Social",
}

