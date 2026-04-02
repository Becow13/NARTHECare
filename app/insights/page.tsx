"use client"

import { useState, useMemo } from "react"
import Link from "next/link"
import { Sparkles, ChevronRight, Calendar, SlidersHorizontal } from "lucide-react"
import {
  MOCK_SUMMARIES,
  MOCK_SENIORS,
  type AISummary,
  type SummaryType,
  type SummaryUrgency,
} from "@/lib/mock-data"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { formatDate, formatRelativeTime } from "@/lib/utils"

const urgencyConfig = {
  urgent: {
    badge: "destructive" as const,
    bar: "bg-red-500",
    label: "Urgent",
  },
  attention: {
    badge: "warning" as const,
    bar: "bg-amber-500",
    label: "Attention",
  },
  routine: {
    badge: "success" as const,
    bar: "bg-emerald-500",
    label: "Routine",
  },
}

const summaryTypeLabel: Record<SummaryType, string> = {
  daily: "Daily Check-in",
  post_visit: "Post-Visit",
  weekly: "Weekly Report",
  anomaly: "Anomaly Detected",
}

export default function InsightsPage() {
  const [seniorFilter, setSeniorFilter] = useState<string>("all")
  const [typeFilter, setTypeFilter] = useState<string>("all")
  const [urgencyFilter, setUrgencyFilter] = useState<string>("all")

  const filtered = useMemo(() => {
    return MOCK_SUMMARIES.filter((s) => {
      if (seniorFilter !== "all" && s.seniorId !== seniorFilter) return false
      if (typeFilter !== "all" && s.summaryType !== typeFilter) return false
      if (urgencyFilter !== "all" && s.urgency !== urgencyFilter) return false
      return true
    }).sort(
      (a, b) =>
        new Date(b.generatedAt).getTime() - new Date(a.generatedAt).getTime()
    )
  }, [seniorFilter, typeFilter, urgencyFilter])

  const clearFilters = () => {
    setSeniorFilter("all")
    setTypeFilter("all")
    setUrgencyFilter("all")
  }

  const hasFilters =
    seniorFilter !== "all" || typeFilter !== "all" || urgencyFilter !== "all"

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-[#1D9E75]" />
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">
            AI Insights
          </h1>
        </div>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
          {MOCK_SUMMARIES.length} AI-generated health summaries across all seniors
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1.5 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
          <SlidersHorizontal className="h-3.5 w-3.5" />
          Filter by
        </div>

        <Select value={seniorFilter} onValueChange={setSeniorFilter}>
          <SelectTrigger className="w-[160px] h-9 text-sm">
            <SelectValue placeholder="All seniors" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Seniors</SelectItem>
            {MOCK_SENIORS.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-[160px] h-9 text-sm">
            <SelectValue placeholder="All types" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="daily">Daily Check-in</SelectItem>
            <SelectItem value="post_visit">Post-Visit</SelectItem>
            <SelectItem value="weekly">Weekly Report</SelectItem>
            <SelectItem value="anomaly">Anomaly Detected</SelectItem>
          </SelectContent>
        </Select>

        <Select value={urgencyFilter} onValueChange={setUrgencyFilter}>
          <SelectTrigger className="w-[140px] h-9 text-sm">
            <SelectValue placeholder="All urgency" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Urgency</SelectItem>
            <SelectItem value="urgent">Urgent</SelectItem>
            <SelectItem value="attention">Attention</SelectItem>
            <SelectItem value="routine">Routine</SelectItem>
          </SelectContent>
        </Select>

        {hasFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={clearFilters}
            className="text-xs h-9 text-gray-500 hover:text-gray-900 dark:hover:text-white"
          >
            Clear filters
          </Button>
        )}

        <span className="text-xs text-gray-400 dark:text-gray-500 ml-auto">
          {filtered.length} result{filtered.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Summary cards grid */}
      {filtered.length === 0 ? (
        <Card className="border-border dark:border-gray-800 dark:bg-gray-900">
          <CardContent className="p-16 text-center">
            <Sparkles className="h-10 w-10 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
            <p className="text-sm font-medium text-gray-600 dark:text-gray-400">
              No summaries match your filters
            </p>
            <Button
              variant="ghost"
              size="sm"
              onClick={clearFilters}
              className="mt-2 text-[#1D9E75]"
            >
              Clear all filters
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {filtered.map((summary) => {
            const urgCfg = urgencyConfig[summary.urgency]
            return (
              <Card
                key={summary.id}
                className="border-border dark:border-gray-800 dark:bg-gray-900 flex flex-col hover:shadow-md transition-shadow"
              >
                {/* Urgency bar */}
                <div className={`h-1 ${urgCfg.bar} rounded-t-xl`} />

                <CardHeader className="pb-2 pt-4 px-5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="w-7 h-7 rounded-full bg-[#1D9E75]/10 flex items-center justify-center shrink-0 text-xs font-bold text-[#1D9E75]">
                        {summary.seniorName.split(" ").map((n) => n[0]).join("")}
                      </div>
                      <div className="min-w-0">
                        <Link
                          href={`/seniors/${summary.seniorId}`}
                          className="text-sm font-semibold text-gray-900 dark:text-white hover:text-[#1D9E75] dark:hover:text-[#4DC8A0] truncate block"
                        >
                          {summary.seniorName}
                        </Link>
                        <p className="text-[10px] text-gray-400 dark:text-gray-500 flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          {formatDate(summary.generatedAt)} ·{" "}
                          {formatRelativeTime(summary.generatedAt)}
                        </p>
                      </div>
                    </div>
                    <Badge variant={urgCfg.badge} className="shrink-0 text-[10px]">
                      {urgCfg.label}
                    </Badge>
                  </div>
                  <div className="mt-2">
                    <span className="inline-flex text-[10px] px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 font-medium">
                      {summaryTypeLabel[summary.summaryType]}
                    </span>
                  </div>
                </CardHeader>

                <CardContent className="px-5 pb-5 flex flex-col flex-1 gap-3">
                  {/* Summary text */}
                  <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed line-clamp-4 flex-1">
                    {summary.plainTextSummary}
                  </p>

                  {/* Key insights */}
                  {summary.keyInsights.length > 0 && (
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500 mb-1.5">
                        Key Insights
                      </p>
                      <ul className="space-y-1">
                        {summary.keyInsights.slice(0, 2).map((insight, i) => (
                          <li
                            key={i}
                            className="flex items-start gap-1.5 text-xs text-gray-600 dark:text-gray-400"
                          >
                            <span className="w-1 h-1 rounded-full bg-[#1D9E75] shrink-0 mt-1.5" />
                            <span className="line-clamp-2">{insight}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Source tags */}
                  <div className="flex flex-wrap gap-1.5">
                    {summary.sourceTags.map((tag) => (
                      <span
                        key={tag}
                        className="text-[10px] px-2 py-0.5 rounded-full bg-[#E8F7F2] dark:bg-[#1D9E75]/10 text-[#1D9E75] dark:text-[#4DC8A0] font-medium"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 pt-2 border-t border-border dark:border-gray-800">
                    <Link href={`/seniors/${summary.seniorId}`} className="flex-1">
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full text-xs h-8"
                      >
                        View Profile
                        <ChevronRight className="h-3 w-3 ml-1" />
                      </Button>
                    </Link>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
