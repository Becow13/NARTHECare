"use client"

import { useState } from "react"
import Link from "next/link"
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  CheckSquare,
  Square,
  ChevronDown,
  ChevronUp,
  MessageSquare,
  X,
  ClipboardList,
} from "lucide-react"
import {
  MOCK_ALERTS,
  MOCK_SENIORS,
  type Alert,
  type AlertSeverity,
  type AlertStatus,
  type AlertCategory,
} from "@/lib/mock-data"
import { ALERT_CATEGORY_LABELS } from "@/lib/alert-rules"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { formatRelativeTime } from "@/lib/utils"

// ─── types ────────────────────────────────────────────────────────────────────

type SeverityFilter = "all" | AlertSeverity | "resolved"

const CATEGORY_PILLS: { key: AlertCategory; label: string }[] = [
  { key: "falls_safety",       label: "Falls & Safety" },
  { key: "cardiovascular",     label: "Cardiovascular" },
  { key: "medication",         label: "Medication" },
  { key: "sleep",              label: "Sleep" },
  { key: "activity_mobility",  label: "Activity" },
  { key: "appointment",        label: "Appointments" },
  { key: "positive_signal",    label: "Positive" },
  { key: "device_connectivity",label: "Device" },
]

// ─── helpers ──────────────────────────────────────────────────────────────────

const seniorAgeMap = Object.fromEntries(
  MOCK_SENIORS.map((s) => [s.id, s.age])
)

const severityBadge: Record<AlertSeverity, "destructive" | "warning" | "info"> = {
  critical: "destructive",
  monitor:  "warning",
  routine:  "info",
}

const severityLabel: Record<AlertSeverity, string> = {
  critical: "Critical",
  monitor:  "Monitor",
  routine:  "Routine",
}

const alertTypeIcon: Record<string, string> = {
  fall_detected:              "🛡️",
  inactivity:                 "😴",
  fall_device_offline:        "🛡️",
  wandering:                  "🚪",
  camera_night_motion:        "📷",
  blood_pressure:             "❤️",
  heart_rate:                 "❤️",
  irregular_rhythm:           "❤️",
  oxygen_saturation:          "💨",
  medication_missed_critical: "💊",
  medication_double_dose:     "💊",
  dementia_no_activity:       "🧠",
  all_devices_offline:        "📡",
  gps_unusual_location:       "📍",
  gps_not_home_overnight:     "📍",
  vitals_trending:            "📈",
  weight_change:              "⚖️",
  sleep_duration:             "🌙",
  sleep_pattern:              "🌙",
  sleep_schedule:             "🌙",
  medication_late:            "💊",
  activity_declined:          "🏃",
  no_outdoor_activity:        "🌳",
  appointment_upcoming_48h:   "📅",
  appointment_missed:         "📅",
  no_kitchen_activity:        "🍽️",
  fridge_no_interaction:      "🥦",
  routine_variation:          "🔄",
  sleep_slightly_low:         "🌙",
  activity_slightly_low:      "🏃",
  appointment_upcoming_week:  "📅",
  prescription_refill:        "💊",
  wellness_visit_due:         "🏥",
  activity_above_baseline:    "⭐",
  best_sleep_week:            "⭐",
  medication_adherence_streak:"⭐",
  device_not_synced:          "📡",
  wearable_battery_low:       "🔋",
  visitor_detected:           "👤",
  phone_activity_low:         "📞",
  tv_pattern_changed:         "📺",
}

// ─── component ────────────────────────────────────────────────────────────────

export default function AlertsPage() {
  const [severityFilter, setSeverityFilter] = useState<SeverityFilter>("all")
  const [categoryFilter, setCategoryFilter] = useState<AlertCategory | null>(null)
  const [alerts, setAlerts] = useState<Alert[]>(MOCK_ALERTS)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  // context suppression: track which alert has the input open + the typed note
  const [contextOpen, setContextOpen] = useState<string | null>(null)
  const [contextNote, setContextNote] = useState("")

  // ── derived counts ──────────────────────────────────────────────────────────
  const active = alerts.filter((a) => a.status !== "resolved" && !a.suppressedBy)
  const criticalCount  = active.filter((a) => a.severity === "critical").length
  const monitorCount   = active.filter((a) => a.severity === "monitor").length
  const resolvedCount  = alerts.filter((a) => a.status === "resolved").length

  // "stable" = seniors who have zero critical/monitor active alerts
  const stableCount = MOCK_SENIORS.filter((s) =>
    !active.some(
      (a) => a.seniorId === s.id && (a.severity === "critical" || a.severity === "monitor")
    )
  ).length

  // ── filtered + sorted list ──────────────────────────────────────────────────
  const filtered = alerts
    .filter((a) => {
      if (severityFilter === "resolved") return a.status === "resolved"
      if (severityFilter !== "all" && a.severity !== severityFilter) return false
      if (categoryFilter && a.category !== categoryFilter) return false
      return true
    })
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())

  // ── actions ─────────────────────────────────────────────────────────────────
  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const markResolved = (id: string) => {
    setAlerts((prev) =>
      prev.map((a) =>
        a.id === id
          ? { ...a, status: "resolved" as AlertStatus, resolvedAt: new Date().toISOString(), resolvedBy: "Becca Yang" }
          : a
      )
    )
    setSelectedIds((prev) => { const n = new Set(prev); n.delete(id); return n })
  }

  const bulkResolve = () => {
    setAlerts((prev) =>
      prev.map((a) =>
        selectedIds.has(a.id)
          ? { ...a, status: "resolved" as AlertStatus, resolvedAt: new Date().toISOString(), resolvedBy: "Becca Yang" }
          : a
      )
    )
    setSelectedIds(new Set())
  }

  const suppressAlert = (id: string) => {
    if (!contextNote.trim()) return
    setAlerts((prev) =>
      prev.map((a) =>
        a.id === id
          ? { ...a, suppressedBy: "Caregiver", status: "acknowledged" as AlertStatus }
          : a
      )
    )
    setContextOpen(null)
    setContextNote("")
  }

  // ── tab counts ──────────────────────────────────────────────────────────────
  const tabs: { key: SeverityFilter; label: string; count: number; countStyle: string }[] = [
    { key: "all",      label: "All",      count: alerts.length,  countStyle: "bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300" },
    { key: "critical", label: "Critical", count: criticalCount,  countStyle: "bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400" },
    { key: "monitor",  label: "Monitor",  count: monitorCount,   countStyle: "bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400" },
    { key: "routine",  label: "Routine",  count: alerts.filter((a) => a.severity === "routine" && a.status !== "resolved").length,
                                          countStyle: "bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400" },
    { key: "resolved", label: "Resolved", count: resolvedCount,  countStyle: "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400" },
  ]

  return (
    <div className="max-w-4xl mx-auto space-y-5">

      {/* ── Page header ──────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">Alerts</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            {active.length} unresolved across {MOCK_SENIORS.length} seniors
          </p>
        </div>
        {selectedIds.size > 0 && (
          <Button
            onClick={bulkResolve}
            variant="outline"
            size="sm"
            className="flex items-center gap-2 border-emerald-300 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-900/20"
          >
            <CheckCircle2 className="h-4 w-4" />
            Resolve {selectedIds.size} selected
          </Button>
        )}
      </div>

      {/* ── Summary bar ──────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-2">
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
          <span className="w-2 h-2 rounded-full bg-red-500 shrink-0" />
          <span className="text-sm font-semibold text-red-700 dark:text-red-400">
            {criticalCount} critical
          </span>
          <span className="text-xs text-red-500 dark:text-red-500">— act today</span>
        </div>
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
          <span className="w-2 h-2 rounded-full bg-amber-500 shrink-0" />
          <span className="text-sm font-semibold text-amber-700 dark:text-amber-400">
            {monitorCount} monitor
          </span>
          <span className="text-xs text-amber-500 dark:text-amber-500">— check in soon</span>
        </div>
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800">
          <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
          <span className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">
            {stableCount} stable
          </span>
          <span className="text-xs text-emerald-500 dark:text-emerald-500">— no action needed</span>
        </div>
      </div>

      {/* ── Severity filter tabs ──────────────────────────────────────────────── */}
      <div className="flex items-center gap-1 p-1 bg-gray-100 dark:bg-gray-800 rounded-lg w-fit flex-wrap">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setSeverityFilter(tab.key)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
              severityFilter === tab.key
                ? "bg-white dark:bg-gray-900 text-gray-900 dark:text-white shadow-sm"
                : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
            }`}
          >
            {tab.label}
            <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${tab.countStyle}`}>
              {tab.count}
            </span>
          </button>
        ))}
      </div>

      {/* ── Category pills ────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-2">
        {CATEGORY_PILLS.map((pill) => {
          const active = categoryFilter === pill.key
          return (
            <button
              key={pill.key}
              onClick={() => setCategoryFilter(active ? null : pill.key)}
              className={`text-xs px-3 py-1.5 rounded-full font-medium border transition-colors ${
                active
                  ? "bg-[#1D9E75] border-[#1D9E75] text-white"
                  : "bg-white dark:bg-gray-900 border-border dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:border-[#1D9E75]/50 hover:text-[#1D9E75]"
              }`}
            >
              {pill.label}
            </button>
          )
        })}
        {categoryFilter && (
          <button
            onClick={() => setCategoryFilter(null)}
            className="text-xs px-2 py-1.5 rounded-full font-medium text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 flex items-center gap-1"
          >
            <X className="h-3 w-3" />
            Clear
          </button>
        )}
      </div>

      {/* ── Alerts list ──────────────────────────────────────────────────────── */}
      <div className="space-y-3">
        {filtered.length === 0 ? (
          <Card className="border-border dark:border-gray-800 dark:bg-gray-900">
            <CardContent className="p-10 text-center">
              <CheckCircle2 className="h-10 w-10 text-emerald-400 mx-auto mb-3" />
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                No alerts match your current filters
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                Try adjusting the severity or category filter above.
              </p>
            </CardContent>
          </Card>
        ) : (
          filtered.map((alert) => {
            const isResolved    = alert.status === "resolved"
            const isSuppressed  = !!alert.suppressedBy
            const isSelected    = selectedIds.has(alert.id)
            const age           = seniorAgeMap[alert.seniorId]
            const categoryLabel = ALERT_CATEGORY_LABELS[alert.category] ?? alert.category
            const isContextOpen = contextOpen === alert.id

            return (
              <Card
                key={alert.id}
                className={`border-border dark:border-gray-800 dark:bg-gray-900 transition-all ${
                  isSelected
                    ? "border-[#1D9E75]/40 bg-[#E8F7F2]/30 dark:bg-[#1D9E75]/5"
                    : isResolved || isSuppressed
                    ? "opacity-55"
                    : ""
                }`}
              >
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">

                    {/* Checkbox (non-resolved only) */}
                    {!isResolved && !isSuppressed && (
                      <button
                        onClick={() => toggleSelect(alert.id)}
                        className="mt-0.5 shrink-0 text-gray-400 hover:text-[#1D9E75] transition-colors"
                        aria-label={isSelected ? "Deselect" : "Select"}
                      >
                        {isSelected
                          ? <CheckSquare className="h-[18px] w-[18px] text-[#1D9E75]" />
                          : <Square className="h-[18px] w-[18px]" />
                        }
                      </button>
                    )}

                    {/* Type icon */}
                    <span className="text-lg shrink-0 mt-0.5 select-none">
                      {alertTypeIcon[alert.type] ?? "⚠️"}
                    </span>

                    {/* Main content */}
                    <div className="flex-1 min-w-0">

                      {/* Top row: badges + senior + timestamp */}
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mb-1.5">
                        <Badge variant={severityBadge[alert.severity]}>
                          {severityLabel[alert.severity]}
                        </Badge>
                        <span className="text-[10px] font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                          {categoryLabel}
                        </span>
                        {alert.patternAlert && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 font-semibold">
                            Pattern
                          </span>
                        )}
                        {alert.personalThresholdApplied && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 font-semibold">
                            Personal threshold
                          </span>
                        )}
                        {isSuppressed && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 font-semibold">
                            Suppressed by {alert.suppressedBy}
                          </span>
                        )}
                      </div>

                      {/* Senior name + age + timestamp */}
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <Link
                          href={`/seniors/${alert.seniorId}`}
                          className="text-sm font-semibold text-gray-900 dark:text-white hover:text-[#1D9E75] dark:hover:text-[#4DC8A0]"
                        >
                          {alert.seniorName}
                        </Link>
                        {age && (
                          <span className="text-xs text-gray-400 dark:text-gray-500">
                            Age {age}
                          </span>
                        )}
                        <span className="text-xs text-gray-400 dark:text-gray-500 flex items-center gap-1 ml-auto">
                          <Clock className="h-3 w-3" />
                          {formatRelativeTime(alert.timestamp)}
                        </span>
                      </div>

                      {/* Title */}
                      <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
                        {alert.title}
                      </h3>

                      {/* AI explanation */}
                      <div className="mt-2 p-3 rounded-lg bg-gray-50 dark:bg-gray-800/60 border border-border dark:border-gray-700">
                        <p className="text-[10px] font-semibold text-[#1D9E75] uppercase tracking-wide mb-1">
                          AI Explanation
                        </p>
                        <p className="text-xs text-gray-600 dark:text-gray-300 leading-relaxed">
                          {alert.aiExplanation}
                        </p>
                      </div>

                      {/* Action taken / resolved info */}
                      {alert.actionTaken && (
                        <div className="mt-2 flex items-start gap-1.5">
                          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0 mt-0.5" />
                          <p className="text-xs text-gray-500 dark:text-gray-400">
                            <span className="font-medium text-gray-600 dark:text-gray-300">Action taken:</span>{" "}
                            {alert.actionTaken}
                          </p>
                        </div>
                      )}
                      {isResolved && alert.resolvedAt && (
                        <p className="mt-1 text-xs text-emerald-600 dark:text-emerald-400">
                          Resolved {formatRelativeTime(alert.resolvedAt)}
                          {alert.resolvedBy ? ` by ${alert.resolvedBy}` : ""}
                        </p>
                      )}

                      {/* Context suppression input */}
                      {isContextOpen && (
                        <div className="mt-3 p-3 rounded-lg bg-blue-50 dark:bg-blue-900/10 border border-blue-200 dark:border-blue-800 space-y-2">
                          <p className="text-xs font-medium text-blue-700 dark:text-blue-400">
                            Log context to suppress this alert
                          </p>
                          <textarea
                            className="w-full text-xs rounded-md border border-border dark:border-gray-700 bg-white dark:bg-gray-900 p-2 text-gray-800 dark:text-gray-200 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#1D9E75] resize-none"
                            rows={2}
                            placeholder="e.g. I spoke with Eleanor — she was napping, all is well."
                            value={contextNote}
                            onChange={(e) => setContextNote(e.target.value)}
                          />
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              className="text-xs h-7"
                              onClick={() => suppressAlert(alert.id)}
                              disabled={!contextNote.trim()}
                            >
                              Suppress alert
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-xs h-7"
                              onClick={() => { setContextOpen(null); setContextNote("") }}
                            >
                              Cancel
                            </Button>
                          </div>
                        </div>
                      )}

                      {/* Action buttons */}
                      {!isResolved && !isSuppressed && (
                        <div className="flex flex-wrap items-center gap-2 mt-3 pt-2 border-t border-border dark:border-gray-800">
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-xs h-7 text-emerald-700 dark:text-emerald-400 border-emerald-300 dark:border-emerald-800 hover:bg-emerald-50 dark:hover:bg-emerald-900/20"
                            onClick={() => markResolved(alert.id)}
                          >
                            <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
                            Mark resolved
                          </Button>
                          {alert.contextSuppressible && !isContextOpen && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-xs h-7 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20"
                              onClick={() => { setContextOpen(alert.id); setContextNote("") }}
                            >
                              <MessageSquare className="h-3.5 w-3.5 mr-1" />
                              Log context
                            </Button>
                          )}
                          <Link
                            href={`/seniors/${alert.seniorId}?tab=action-plans&newplan=${alert.id}`}
                            className="ml-auto"
                          >
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-xs h-7 text-[#1D9E75] hover:bg-[#E8F7F2] dark:hover:bg-[#1D9E75]/10"
                            >
                              <ClipboardList className="h-3.5 w-3.5 mr-1" />
                              Create Action Plan
                            </Button>
                          </Link>
                        </div>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          })
        )}
      </div>
    </div>
  )
}
