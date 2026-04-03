"use client"

import { useState, Suspense } from "react"
import { useSearchParams } from "next/navigation"
import { ClipboardList, CheckCircle2 } from "lucide-react"
import { MOCK_ACTION_PLANS, type ActionPlan } from "@/lib/mock-data"
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

const seniorNames = Array.from(
  new Map(MOCK_ACTION_PLANS.map((p) => [p.seniorId, p.seniorName])).entries()
).map(([id, name]) => ({ id, name }))

function ActionPlansContent() {
  const searchParams = useSearchParams()
  const seniorIdParam = searchParams.get("seniorId") ?? null

  const seniorName = seniorIdParam
    ? MOCK_ACTION_PLANS.find((p) => p.seniorId === seniorIdParam)?.seniorName ?? null
    : null

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
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">
          {seniorName ? `Action Plans — ${seniorName}` : "Action Plans"}
        </h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
          {seniorName
            ? `AI-generated care plans for ${seniorName}.`
            : "AI-generated care plans across all seniors."}
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
          className="text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-200 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#1D9E75]/30"
        >
          <option value="all">All seniors</option>
          {seniorNames.map(({ id, name }) => (
            <option key={id} value={id}>{name}</option>
          ))}
        </select>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-200 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#1D9E75]/30"
        >
          <option value="all">All statuses</option>
          <option value="open">Open</option>
          <option value="in_progress">In Progress</option>
          <option value="complete">Completed</option>
        </select>
      </div>

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
                                <CheckCircle2 className="h-3 w-3 text-[#1D9E75]" />
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
