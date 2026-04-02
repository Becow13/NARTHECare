"use client"

import { useState } from "react"
import Link from "next/link"
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Filter,
  CheckSquare,
  Square,
} from "lucide-react"
import { MOCK_ALERTS, type Alert, type AlertSeverity, type AlertStatus } from "@/lib/mock-data"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { formatDateTime, formatRelativeTime } from "@/lib/utils"

type FilterTab = "all" | AlertSeverity | "resolved"

const severityBadge: Record<AlertSeverity, "destructive" | "warning" | "info"> = {
  critical: "destructive",
  moderate: "warning",
  low: "info",
}

const statusLabel: Record<AlertStatus, { label: string; icon: React.ReactNode }> = {
  active: {
    label: "Active",
    icon: <span className="w-2 h-2 rounded-full bg-red-500 inline-block" />,
  },
  acknowledged: {
    label: "Acknowledged",
    icon: <span className="w-2 h-2 rounded-full bg-amber-500 inline-block" />,
  },
  resolved: {
    label: "Resolved",
    icon: <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />,
  },
}

const alertTypeIcon: Record<string, string> = {
  vitals: "❤️",
  fall: "🛡️",
  medication: "💊",
  behavioral: "🧠",
  appointment: "📅",
}

export default function AlertsPage() {
  const [activeFilter, setActiveFilter] = useState<FilterTab>("all")
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [alerts, setAlerts] = useState<Alert[]>(MOCK_ALERTS)

  const filtered = alerts.filter((a) => {
    if (activeFilter === "all") return true
    if (activeFilter === "resolved") return a.status === "resolved"
    return a.severity === activeFilter
  })

  const sorted = [...filtered].sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  )

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const handleBulkResolve = () => {
    setAlerts((prev) =>
      prev.map((a) =>
        selectedIds.has(a.id)
          ? { ...a, status: "resolved" as AlertStatus, resolvedAt: new Date().toISOString(), resolvedBy: "Becca Yang" }
          : a
      )
    )
    setSelectedIds(new Set())
  }

  const counts = {
    all: alerts.length,
    critical: alerts.filter((a) => a.severity === "critical").length,
    moderate: alerts.filter((a) => a.severity === "moderate").length,
    low: alerts.filter((a) => a.severity === "low").length,
    resolved: alerts.filter((a) => a.status === "resolved").length,
  }

  const tabs: { key: FilterTab; label: string; count: number }[] = [
    { key: "all", label: "All", count: counts.all },
    { key: "critical", label: "Critical", count: counts.critical },
    { key: "moderate", label: "Moderate", count: counts.moderate },
    { key: "low", label: "Low", count: counts.low },
    { key: "resolved", label: "Resolved", count: counts.resolved },
  ]

  const activeUnresolved = sorted.filter((a) => a.status !== "resolved")

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">
            Alerts
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            {activeUnresolved.length} unresolved · {counts.critical} critical
          </p>
        </div>
        {selectedIds.size > 0 && (
          <Button
            onClick={handleBulkResolve}
            variant="outline"
            size="sm"
            className="flex items-center gap-2 border-emerald-300 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-900/20"
          >
            <CheckCircle2 className="h-4 w-4" />
            Resolve {selectedIds.size} selected
          </Button>
        )}
      </div>

      {/* Filter tabs */}
      <div className="flex items-center gap-1 p-1 bg-gray-100 dark:bg-gray-800 rounded-lg w-fit flex-wrap">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveFilter(tab.key)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
              activeFilter === tab.key
                ? "bg-white dark:bg-gray-900 text-gray-900 dark:text-white shadow-sm"
                : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
            }`}
          >
            {tab.label}
            <span
              className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${
                activeFilter === tab.key
                  ? tab.key === "critical"
                    ? "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400"
                    : tab.key === "moderate"
                    ? "bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400"
                    : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300"
                  : "bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400"
              }`}
            >
              {tab.count}
            </span>
          </button>
        ))}
      </div>

      {/* Alerts list */}
      <div className="space-y-3">
        {sorted.length === 0 ? (
          <Card className="border-border dark:border-gray-800 dark:bg-gray-900">
            <CardContent className="p-10 text-center">
              <CheckCircle2 className="h-10 w-10 text-emerald-400 mx-auto mb-3" />
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                No alerts in this category
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                Everything is under control.
              </p>
            </CardContent>
          </Card>
        ) : (
          sorted.map((alert) => {
            const isSelected = selectedIds.has(alert.id)
            const isResolved = alert.status === "resolved"
            const statusCfg = statusLabel[alert.status]
            return (
              <Card
                key={alert.id}
                className={`border-border dark:border-gray-800 dark:bg-gray-900 transition-all ${
                  isSelected
                    ? "border-[#1D9E75]/40 bg-[#E8F7F2]/30 dark:bg-[#1D9E75]/5"
                    : isResolved
                    ? "opacity-60"
                    : ""
                }`}
              >
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    {/* Checkbox */}
                    {!isResolved && (
                      <button
                        onClick={() => toggleSelect(alert.id)}
                        className="mt-0.5 shrink-0 text-gray-400 hover:text-[#1D9E75] transition-colors"
                        aria-label={isSelected ? "Deselect" : "Select"}
                      >
                        {isSelected ? (
                          <CheckSquare className="h-4.5 w-4.5 text-[#1D9E75]" />
                        ) : (
                          <Square className="h-4.5 w-4.5" />
                        )}
                      </button>
                    )}

                    {/* Type icon */}
                    <span className="text-lg shrink-0 mt-0.5">
                      {alertTypeIcon[alert.type] ?? "⚠️"}
                    </span>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <Badge variant={severityBadge[alert.severity]}>
                          {alert.severity}
                        </Badge>
                        <div className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
                          {statusCfg.icon}
                          {statusCfg.label}
                        </div>
                        <Link
                          href={`/seniors/${alert.seniorId}`}
                          className="text-sm font-semibold text-gray-900 dark:text-white hover:text-[#1D9E75] dark:hover:text-[#4DC8A0]"
                        >
                          {alert.seniorName}
                        </Link>
                        <span className="text-xs text-gray-400 dark:text-gray-500">
                          <Clock className="h-3 w-3 inline mr-0.5" />
                          {formatRelativeTime(alert.timestamp)}
                        </span>
                      </div>

                      <h3 className="text-sm font-medium text-gray-900 dark:text-white">
                        {alert.title}
                      </h3>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                        {alert.description}
                      </p>

                      {/* AI explanation */}
                      <div className="mt-2 p-3 rounded-lg bg-gray-50 dark:bg-gray-800/60 border border-border dark:border-gray-700">
                        <div className="flex items-center gap-1.5 mb-1">
                          <span className="text-[10px] font-semibold text-[#1D9E75] uppercase tracking-wide">
                            AI Explanation
                          </span>
                        </div>
                        <p className="text-xs text-gray-600 dark:text-gray-300 leading-relaxed">
                          {alert.aiExplanation}
                        </p>
                      </div>

                      {/* Action taken */}
                      {alert.actionTaken && (
                        <div className="mt-2 flex items-start gap-1.5">
                          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0 mt-0.5" />
                          <p className="text-xs text-gray-500 dark:text-gray-400">
                            <span className="font-medium text-gray-600 dark:text-gray-300">
                              Action taken:
                            </span>{" "}
                            {alert.actionTaken}
                          </p>
                        </div>
                      )}
                      {alert.resolvedAt && (
                        <p className="mt-1 text-xs text-emerald-600 dark:text-emerald-400">
                          Resolved {formatDateTime(alert.resolvedAt)}
                          {alert.resolvedBy ? ` by ${alert.resolvedBy}` : ""}
                        </p>
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
