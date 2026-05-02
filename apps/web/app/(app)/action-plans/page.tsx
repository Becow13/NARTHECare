"use client"

import { useState, Suspense } from "react"
import { useSearchParams } from "next/navigation"
import { ClipboardList, CheckCircle2, Loader2, X } from "lucide-react"
import { MOCK_ACTION_PLANS, MOCK_ALERTS, type ActionPlan, type Alert } from "@/lib/mock-data"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { formatRelativeTime } from "@/lib/utils"

const statusConfig = {
  open: { label: "Open", variant: "warning" as const },
  in_progress: { label: "In Progress", variant: "default" as const },
  complete: { label: "Complete", variant: "success" as const },
}

const statusGroups: Array<{ key: ActionPlan["status"]; label: string }> = [
  { key: "open", label: "Open" },
  { key: "in_progress", label: "In Progress" },
  { key: "complete", label: "Completed" },
]

const severityBadge = {
  critical: "destructive" as const,
  monitor:  "warning" as const,
  routine:  "info" as const,
}

const severityLabel: Record<string, string> = {
  critical: "Critical",
  monitor:  "Monitor",
  routine:  "Routine",
}

const seniorNames = Array.from(
  new Map(MOCK_ACTION_PLANS.map((p) => [p.seniorId, p.seniorName])).entries()
).map(([id, name]) => ({ id, name }))

function ActionPlansContent() {
  const searchParams = useSearchParams()
  const seniorIdParam = searchParams.get("seniorId") ?? null

  const seniorName = seniorIdParam
    ? (MOCK_ACTION_PLANS.find((p) => p.seniorId === seniorIdParam)?.seniorName
        ?? MOCK_ALERTS.find((a) => a.seniorId === seniorIdParam)?.seniorName
        ?? null)
    : null

  const seniorAlerts = seniorIdParam
    ? MOCK_ALERTS.filter((a) => a.seniorId === seniorIdParam)
    : []

  const critical = seniorAlerts.filter((a) => a.severity === "critical")
  const monitor  = seniorAlerts.filter((a) => a.severity === "monitor")
  const routine  = seniorAlerts.filter((a) => a.severity === "routine")
  const openAlerts = seniorAlerts.filter(
    (a) => a.status === "active" || a.status === "acknowledged"
  )


  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set())
  const [context, setContext] = useState("")
  const [isGenerating, setIsGenerating] = useState(false)
  const [showBanner, setShowBanner] = useState(false)

  const handleGenerate = () => {
    setIsGenerating(true)
    setTimeout(() => {
      setIsGenerating(false)
      setShowBanner(true)
      setTimeout(() => setShowBanner(false), 4000)
    }, 1500)
  }

  const toggleAlert = (id: string) =>
    setCheckedIds((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })

  const selectAllCritical = () =>
    setCheckedIds((prev) => new Set([...Array.from(prev), ...critical.map((a) => a.id)]))

  const selectAllOpen = () =>
    setCheckedIds((prev) => new Set([...Array.from(prev), ...openAlerts.map((a) => a.id)]))

  const clearAll = () => setCheckedIds(new Set())

  const [seniorFilter, setSeniorFilter] = useState(seniorIdParam ?? "all")
  const [statusFilter, setStatusFilter] = useState("all")

  const filtered = MOCK_ACTION_PLANS.filter((p) => {
    if (seniorFilter !== "all" && p.seniorId !== seniorFilter) return false
    if (statusFilter !== "all" && p.status !== statusFilter) return false
    return true
  })

  const totalOpen = MOCK_ACTION_PLANS.filter((p) => p.status === "open").length
  const totalInProgress = MOCK_ACTION_PLANS.filter((p) => p.status === "in_progress").length
  const totalComplete = MOCK_ACTION_PLANS.filter((p) => p.status === "complete").length

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Success banner */}
      {showBanner && (
        <div className="flex items-center justify-between gap-3 px-4 py-3 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <span className="text-sm font-medium text-emerald-800 dark:text-emerald-300">
              Action plan generated
            </span>
          </div>
          <button
            onClick={() => setShowBanner(false)}
            className="text-emerald-600 dark:text-emerald-400 hover:text-emerald-800 dark:hover:text-emerald-200"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Page header */}
      <div>
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">
          {seniorName ? `Action Plans — ${seniorName}` : "Action Plans"}
        </h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
          {seniorName
            ? `AI-generated care plans for ${seniorName}.`
            : "AI-Generated Care Plans Across Your Care Circle"}
        </p>
      </div>

      {/* Summary chips */}
      <div className="flex flex-wrap gap-3">
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
          <span className="w-2 h-2 rounded-full bg-amber-500 shrink-0" />
          <span className="text-xs font-medium text-amber-700 dark:text-amber-400">
            {totalOpen} Open
          </span>
        </div>
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
          <span className="w-2 h-2 rounded-full bg-blue-500 shrink-0" />
          <span className="text-xs font-medium text-blue-700 dark:text-blue-400">
            {totalInProgress} In Progress
          </span>
        </div>
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800">
          <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
          <span className="text-xs font-medium text-emerald-700 dark:text-emerald-400">
            {totalComplete} Completed
          </span>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <select
          value={seniorFilter}
          onChange={(e) => setSeniorFilter(e.target.value)}
          className="text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-200 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#3B5BDB]/30"
        >
          <option value="all">All Care Members</option>
          {seniorNames.map(({ id, name }) => (
            <option key={id} value={id}>{name}</option>
          ))}
        </select>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-200 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#3B5BDB]/30"
        >
          <option value="all">All Statuses</option>
          <option value="open">Open</option>
          <option value="in_progress">In Progress</option>
          <option value="complete">Completed</option>
        </select>
      </div>

      {/* Alert checklist — shown only when filtered to a specific senior */}
      {seniorIdParam && (
        <Card className="border-border dark:border-gray-800 dark:bg-gray-900">
          <CardContent className="px-5 py-4 space-y-4">
            {/* Label */}
<h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Create A New Action Plan(s)</h2>            <p className="text-xs font-bold text-gray-800 dark:text-gray-200">
              
Select alerts to include
            </p>

            {/* Shortcut buttons */}
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={selectAllCritical}
                disabled={critical.length === 0}
                className="text-[11px] font-medium px-2.5 py-1 rounded-md border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Select all critical
              </button>
              <button
                type="button"
                onClick={selectAllOpen}
                disabled={openAlerts.length === 0}
                className="text-[11px] font-medium px-2.5 py-1 rounded-md border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Select all open
              </button>
              <button
                type="button"
                onClick={clearAll}
                disabled={checkedIds.size === 0}
                className="text-[11px] px-2.5 py-1 rounded-md border border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Clear selection
              </button>
            </div>

            {/* Alert checklist */}
            <div className="border border-gray-200 dark:border-gray-700 rounded-lg divide-y divide-gray-100 dark:divide-gray-800 bg-white dark:bg-gray-900/50">
              {seniorAlerts.length === 0 ? (
                <p className="text-xs text-gray-400 dark:text-gray-500 text-center py-6">
                  No alerts on record for this senior.
                </p>
              ) : (
                [
                  { group: critical, label: "Critical", labelColor: "text-red-500 dark:text-red-400" },
                  { group: monitor,  label: "Monitor",  labelColor: "text-amber-500 dark:text-amber-400" },
                  { group: routine,  label: "Routine",  labelColor: "text-blue-500 dark:text-blue-400" },
                ].map(({ group, label, labelColor }) =>
                  group.length === 0 ? null : (
                    <div key={label} className="px-3 py-2.5 space-y-0.5">
                      <p className={`text-[10px] font-semibold uppercase tracking-wider mb-2 ${labelColor}`}>
                        {label}
                      </p>
                      {group.map((alert) => (
                        <label
                          key={alert.id}
                          className="flex items-center gap-3 py-1.5 rounded-md hover:bg-gray-50 dark:hover:bg-gray-800/50 cursor-pointer px-1 -mx-1"
                        >
                          <input
                            type="checkbox"
                            className="accent-[#3B5BDB] shrink-0"
                            checked={checkedIds.has(alert.id)}
                            onChange={() => toggleAlert(alert.id)}
                          />
                          <Badge variant={severityBadge[alert.severity]} className="text-[10px] shrink-0">
                            {severityLabel[alert.severity] ?? alert.severity}
                          </Badge>
                          <span className="flex-1 min-w-0 text-xs font-semibold text-gray-900 dark:text-white truncate">
                            {alert.title}
                          </span>
                          <span className="text-[10px] text-gray-400 dark:text-gray-500 shrink-0 whitespace-nowrap">
                            {formatRelativeTime(alert.timestamp)}
                          </span>
                        </label>
                      ))}
                    </div>
                  )
                )
              )}
            </div>

            {/* Running count */}
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {checkedIds.size === 0 ? (
                <span className="text-gray-400 dark:text-gray-500">No alerts selected</span>
              ) : (
                <span className="font-medium text-[#3B5BDB]">
                  {checkedIds.size} alert{checkedIds.size !== 1 ? "s" : ""} selected
                </span>
              )}
            </p>

            {/* Context input */}
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                Additional context (optional)
              </label>
              <input
                type="text"
                value={context}
                onChange={(e) => setContext(e.target.value)}
                placeholder="e.g. budget under $100, preparing for Thursday's appointment"
                className="w-full text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-gray-800 dark:text-gray-200 placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-[#3B5BDB]/30"
              />
            </div>

            {/* Generate button */}
            <button
              type="button"
              onClick={handleGenerate}
              disabled={checkedIds.size === 0 || isGenerating}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors bg-[#3B5BDB] hover:bg-[#2F4AC4] text-white disabled:bg-gray-200 dark:disabled:bg-gray-700 disabled:text-gray-400 dark:disabled:text-gray-500 disabled:cursor-not-allowed"
            >
              {isGenerating ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Generating plan...
                </>
              ) : (
                "Generate Action Plan from Selected Alerts"
              )}
            </button>
          </CardContent>
        </Card>
      )}
<h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Action Plan(s)</h2>
      {/* Plan list grouped by status */}
      {filtered.length === 0 ? (
        <Card className="border-border dark:border-gray-800 dark:bg-gray-900">
          <CardContent className="p-12 text-center">
            <ClipboardList className="h-8 w-8 text-gray-300 dark:text-gray-600 mx-auto mb-2" />
            <p className="text-sm font-medium text-gray-600 dark:text-gray-400">No action plans match your filters</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-8">
          {statusGroups.map(({ key, label }) => {
            const group = filtered.filter((p) => p.status === key)
            if (group.length === 0) return null
            return (
              <div key={key} className="space-y-3">
                <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  {label} <span className="font-normal normal-case">({group.length})</span>
                </h2>
                <div className="space-y-3">
                  {group.map((plan) => {
                    const sCfg = statusConfig[plan.status]
                    return (
                      <Card
                        key={plan.id}
                        className="border-border dark:border-gray-800 dark:bg-gray-900"
                      >
                        <CardContent className="p-5">
                          <div className="flex items-start justify-between gap-3 flex-wrap">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap mb-1">
                                <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
                                  {plan.title}
                                </h3>
                                <Badge variant={sCfg.variant} className="text-[10px] shrink-0">
                                  {sCfg.label}
                                </Badge>
                              </div>
                              <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                                {plan.seniorName} · Generated {formatRelativeTime(plan.generatedAt)}
                              </p>
                              <p className="text-xs text-gray-600 dark:text-gray-400 leading-relaxed line-clamp-2">
                                {plan.summary}
                              </p>
                            </div>
                          </div>

                          {/* Linked alert tags */}
                          {plan.linkedAlertIds.length > 0 && (
                            <div className="flex flex-wrap gap-1.5 mt-3">
                              {plan.linkedAlertIds.map((id) => (
                                <span
                                  key={id}
                                  className="text-[10px] px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 font-medium"
                                >
                                  {id}
                                </span>
                              ))}
                            </div>
                          )}

                          {/* Chosen option + notes preview */}
                          <div className="flex flex-wrap items-center gap-3 mt-3 pt-3 border-t border-border dark:border-gray-800 text-xs text-gray-500 dark:text-gray-400">
                            {plan.chosenOptionLevel ? (
                              <span className="flex items-center gap-1">
                                <CheckCircle2 className="h-3 w-3 text-[#3B5BDB]" />
                                Approach:{" "}
                                <span className="font-medium text-gray-700 dark:text-gray-300 capitalize">
                                  {plan.chosenOptionLevel}
                                </span>
                              </span>
                            ) : (
                              <span className="text-gray-400 dark:text-gray-500 italic">No approach chosen yet</span>
                            )}
                            {plan.caregiverNotes && (
                              <span className="truncate max-w-xs">
                                Note: {plan.caregiverNotes}
                              </span>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default function ActionPlansPage() {
  return (
    <Suspense>
      <ActionPlansContent />
    </Suspense>
  )
}
