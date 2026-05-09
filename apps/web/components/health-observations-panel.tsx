"use client"

/**
 * HealthObservationsPanel — consolidated latest-per-metric vitals view
 * with a simple inline form for caregiver-entered manual readings.
 *
 * Fetches the last 7 days of observations from
 * `GET /api/data/care-recipients/:id/observations`, groups them by
 * `metric_type` keeping only the newest row per type, and renders one
 * card per metric. An "Add Reading" toggle opens an inline form that
 * calls `POST /api/data/care-recipients/:id/observations` and refreshes
 * the grid on success.
 *
 * PHI safety: this component never logs observation values, timestamps,
 * or metric data. Error states show generic caregiver-friendly copy only.
 */

import { useCallback, useEffect, useReducer, useState } from "react"
import { useRouter } from "next/navigation"
import { PlusCircle, RefreshCw, Activity } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { formatRelativeTime } from "@/lib/utils"
import type { HealthObservationRow } from "@/services/careRecipientService"

// ─── Metric metadata ─────────────────────────────────────────────────────────

interface MetricMeta {
  label: string
  unit: string
  displayUnit: string
  step: string
}

const METRIC_META: Record<string, MetricMeta> = {
  steps: { label: "Steps", unit: "count", displayUnit: "steps", step: "1" },
  resting_heart_rate: { label: "Heart Rate", unit: "bpm", displayUnit: "bpm", step: "1" },
  hrv: { label: "HRV", unit: "ms", displayUnit: "ms", step: "0.1" },
  spo2: { label: "SpO₂", unit: "percent", displayUnit: "%", step: "0.1" },
  sleep_duration: { label: "Sleep", unit: "hours", displayUnit: "hrs", step: "0.1" },
  respiratory_rate: { label: "Resp. Rate", unit: "breaths_per_min", displayUnit: "br/min", step: "0.1" },
  walking_steadiness: { label: "Walking Steadiness", unit: "score", displayUnit: "score", step: "0.01" },
  fall_event: { label: "Fall Event", unit: "event", displayUnit: "event", step: "1" },
}

const METRIC_TYPES = Object.keys(METRIC_META)

// ─── State types ─────────────────────────────────────────────────────────────

type PanelState =
  | { kind: "loading" }
  | { kind: "ready"; latest: HealthObservationRow[] }
  | { kind: "error" }

type FormState =
  | { kind: "idle" }
  | { kind: "submitting" }
  | { kind: "error"; message: string }

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Keep only the newest observation per metric_type. */
function consolidate(rows: HealthObservationRow[]): HealthObservationRow[] {
  const seen = new Map<string, HealthObservationRow>()
  for (const row of rows) {
    if (!seen.has(row.metric_type)) {
      seen.set(row.metric_type, row)
    }
  }
  return [...seen.values()].sort((a, b) =>
    (METRIC_META[a.metric_type]?.label ?? a.metric_type).localeCompare(
      METRIC_META[b.metric_type]?.label ?? b.metric_type,
    ),
  )
}

function formatValue(row: HealthObservationRow): string {
  if (row.value_numeric === null) return "—"
  const meta = METRIC_META[row.metric_type]
  const val = row.metric_type === "spo2"
    ? `${(row.value_numeric).toFixed(1)} ${meta?.displayUnit ?? row.value_unit}`
    : row.metric_type === "steps"
    ? `${Math.round(row.value_numeric).toLocaleString()} ${meta?.displayUnit ?? row.value_unit}`
    : row.metric_type === "hrv" || row.metric_type === "sleep_duration" || row.metric_type === "respiratory_rate"
    ? `${row.value_numeric.toFixed(1)} ${meta?.displayUnit ?? row.value_unit}`
    : `${row.value_numeric} ${meta?.displayUnit ?? row.value_unit}`
  return val
}

/** Seven days ago as ISO string for the `since` filter. */
function sevenDaysAgo(): string {
  return new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
}

/** Local datetime string for the default observedAt field (datetime-local input). */
function nowLocalDatetime(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

// ─── Component ───────────────────────────────────────────────────────────────

interface HealthObservationsPanelProps {
  /** Care-recipient UUID */
  recipientId: string
}

export function HealthObservationsPanel({ recipientId }: HealthObservationsPanelProps) {
  const router = useRouter()
  const [panelState, setPanelState] = useState<PanelState>({ kind: "loading" })
  const [showForm, setShowForm] = useState(false)
  const [formState, setFormState] = useState<FormState>({ kind: "idle" })

  // Form field state
  const [metricType, setMetricType] = useState("")
  const [value, setValue] = useState("")
  const [observedAt, setObservedAt] = useState(nowLocalDatetime)

  const load = useCallback(async () => {
    setPanelState({ kind: "loading" })
    try {
      const since = sevenDaysAgo()
      const res = await fetch(
        `/api/data/care-recipients/${encodeURIComponent(recipientId)}/observations?since=${encodeURIComponent(since)}&limit=200`,
        { cache: "no-store" },
      )
      if (res.status === 401) {
        router.replace("/auth/sign-in")
        return
      }
      if (!res.ok) {
        setPanelState({ kind: "error" })
        return
      }
      const data: { observations?: HealthObservationRow[] } = await res.json()
      const rows = data.observations ?? []
      setPanelState({ kind: "ready", latest: consolidate(rows) })
    } catch {
      setPanelState({ kind: "error" })
    }
  }, [recipientId, router])

  useEffect(() => {
    void load()
  }, [load])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    if (!metricType) {
      setFormState({ kind: "error", message: "Please select a metric type." })
      return
    }
    const numValue = Number(value)
    if (!value || !Number.isFinite(numValue)) {
      setFormState({ kind: "error", message: "Please enter a valid numeric value." })
      return
    }
    if (!observedAt) {
      setFormState({ kind: "error", message: "Please select a date and time." })
      return
    }

    setFormState({ kind: "submitting" })

    try {
      const res = await fetch(
        `/api/data/care-recipients/${encodeURIComponent(recipientId)}/observations`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            metricType,
            value: numValue,
            observedAt: new Date(observedAt).toISOString(),
          }),
        },
      )
      if (res.status === 401) {
        router.replace("/auth/sign-in")
        return
      }
      if (!res.ok) {
        setFormState({ kind: "error", message: "Unable to save reading. Please try again." })
        return
      }
      setFormState({ kind: "idle" })
      setShowForm(false)
      setMetricType("")
      setValue("")
      setObservedAt(nowLocalDatetime())
      await load()
    } catch {
      setFormState({ kind: "error", message: "Unable to save reading. Please check your connection." })
    }
  }

  function handleCancel() {
    setShowForm(false)
    setFormState({ kind: "idle" })
    setMetricType("")
    setValue("")
    setObservedAt(nowLocalDatetime())
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
        <h2 className="text-base font-semibold text-gray-900 dark:text-white">
          Vitals — Last 7 Days
        </h2>
        <div className="flex items-center gap-2">
          <button
            onClick={() => void load()}
            className="inline-flex items-center gap-1 text-xs text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
            aria-label="Refresh vitals"
          >
            <RefreshCw className="h-3 w-3" />
            Refresh
          </button>
          <Button
            size="sm"
            variant="outline"
            className="text-xs h-8"
            onClick={() => setShowForm((v) => !v)}
          >
            <PlusCircle className="h-3.5 w-3.5 mr-1.5" />
            Add Reading
          </Button>
        </div>
      </div>

      {/* Inline add-reading form */}
      {showForm && (
        <Card className="border-border dark:border-gray-800 dark:bg-gray-900 mb-4">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Add a Manual Reading</CardTitle>
          </CardHeader>
          <CardContent className="px-5 pb-5">
            <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="obs-metric" className="text-xs">
                    Metric
                  </Label>
                  <Select value={metricType} onValueChange={setMetricType}>
                    <SelectTrigger id="obs-metric" className="h-9 text-sm">
                      <SelectValue placeholder="Select metric…" />
                    </SelectTrigger>
                    <SelectContent>
                      {METRIC_TYPES.map((mt) => (
                        <SelectItem key={mt} value={mt} className="text-sm">
                          {METRIC_META[mt]?.label ?? mt}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="obs-value" className="text-xs">
                    Value
                    {metricType && METRIC_META[metricType] && (
                      <span className="ml-1 text-gray-400">
                        ({METRIC_META[metricType].displayUnit})
                      </span>
                    )}
                  </Label>
                  <Input
                    id="obs-value"
                    type="number"
                    step={metricType ? (METRIC_META[metricType]?.step ?? "any") : "any"}
                    min={0}
                    placeholder="e.g. 72"
                    value={value}
                    onChange={(e) => setValue(e.target.value)}
                    className="h-9 text-sm"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="obs-at" className="text-xs">
                    Recorded at
                  </Label>
                  <Input
                    id="obs-at"
                    type="datetime-local"
                    value={observedAt}
                    onChange={(e) => setObservedAt(e.target.value)}
                    className="h-9 text-sm"
                  />
                </div>
              </div>

              {formState.kind === "error" && (
                <p className="text-xs text-red-500 dark:text-red-400">
                  {formState.message}
                </p>
              )}

              <div className="flex items-center gap-2">
                <Button
                  type="submit"
                  size="sm"
                  className="bg-[#1D9E75] hover:bg-[#187E5D] text-white h-8 text-xs"
                  disabled={formState.kind === "submitting"}
                >
                  {formState.kind === "submitting" ? "Saving…" : "Save Reading"}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-8 text-xs"
                  onClick={handleCancel}
                  disabled={formState.kind === "submitting"}
                >
                  Cancel
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Vitals grid */}
      {panelState.kind === "loading" ? (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="h-24 rounded-lg bg-gray-100 dark:bg-gray-900 animate-pulse border border-border dark:border-gray-800"
            />
          ))}
        </div>
      ) : panelState.kind === "error" ? (
        <Card className="border-border dark:border-gray-800 dark:bg-gray-900">
          <CardContent className="p-6 text-center">
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Unable to load vitals. Please try again later.
            </p>
          </CardContent>
        </Card>
      ) : panelState.latest.length === 0 ? (
        <Card className="border-border dark:border-gray-800 dark:bg-gray-900">
          <CardContent className="p-6 text-center">
            <Activity className="h-8 w-8 text-gray-300 dark:text-gray-700 mx-auto mb-2" />
            <p className="text-sm text-gray-500 dark:text-gray-400">
              No vitals on record yet. Add a reading above or connect Apple Health
              to start seeing data here.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {panelState.latest.map((row) => {
            const meta = METRIC_META[row.metric_type]
            return (
              <Card
                key={row.id}
                className="border-border dark:border-gray-800 dark:bg-gray-900"
              >
                <CardContent className="p-4">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-1.5">
                    {meta?.label ?? row.metric_type}
                  </p>
                  <p className="text-xl font-bold text-gray-900 dark:text-white leading-none">
                    {formatValue(row)}
                  </p>
                  <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-1.5">
                    {formatRelativeTime(row.observed_at)}
                    {row.source_type === "manual" && (
                      <span className="ml-1 italic">· manual</span>
                    )}
                  </p>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
