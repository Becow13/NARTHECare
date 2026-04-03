import Link from "next/link"
import {
  Users,
  AlertTriangle,
  CalendarClock,
  Activity,
  TrendingUp,
  TrendingDown,
  Minus,
  ChevronRight,
  Sparkles,
  Phone,
  Flag,
  CheckCircle2,
  Clock,
} from "lucide-react"
import {
  MOCK_SENIORS,
  MOCK_DASHBOARD_STATS,
  MOCK_ALERTS,
  MOCK_SUMMARIES,
  MOCK_APPOINTMENTS,
} from "@/lib/mock-data"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { formatRelativeTime, formatDateTime } from "@/lib/utils"

const statusConfig = {
  routine: {
    label: "Routine",
    color: "text-emerald-600 dark:text-emerald-400",
    bg: "bg-emerald-50 dark:bg-emerald-900/20",
    dot: "bg-emerald-500",
  },
  monitor: {
    label: "Monitor",
    color: "text-amber-600 dark:text-amber-400",
    bg: "bg-amber-50 dark:bg-amber-900/20",
    dot: "bg-amber-500",
  },
  critical: {
    label: "Critical",
    color: "text-red-600 dark:text-red-400",
    bg: "bg-red-50 dark:bg-red-900/20",
    dot: "bg-red-500",
  },
}

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

const avatarBg: Record<string, string> = {
  critical: "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400",
  monitor:  "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400",
  routine:  "bg-[#1D9E75]/10 dark:bg-[#1D9E75]/20 text-[#1D9E75] dark:text-[#4DC8A0]",
}

const overallStatusConfig = {
  all_stable: {
    label: "All Stable",
    color: "text-emerald-600 dark:text-emerald-400",
    bg: "bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800",
    icon: CheckCircle2,
  },
  needs_attention: {
    label: "Needs Attention",
    color: "text-amber-600 dark:text-amber-400",
    bg: "bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800",
    icon: AlertTriangle,
  },
  critical: {
    label: "Critical",
    color: "text-red-600 dark:text-red-400",
    bg: "bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800",
    icon: AlertTriangle,
  },
}

function TrendIcon({ value }: { value: number }) {
  if (value > 0)
    return <TrendingUp className="h-3.5 w-3.5 text-amber-500" />
  if (value < 0)
    return <TrendingDown className="h-3.5 w-3.5 text-emerald-500" />
  return <Minus className="h-3.5 w-3.5 text-gray-400" />
}

export default function DashboardPage() {
  const stats = MOCK_DASHBOARD_STATS
  const seniors = MOCK_SENIORS
  const activeAlerts = MOCK_ALERTS.filter((a) => a.status === "active")
  const recentSummaries = MOCK_SUMMARIES.slice(0, 3)
  const upcomingAppts = MOCK_APPOINTMENTS
    .filter((a) => new Date(a.dateTime) > new Date())
    .sort((a, b) => new Date(a.dateTime).getTime() - new Date(b.dateTime).getTime())
    .slice(0, 3)

  const overallCfg = overallStatusConfig[stats.overallStatus]
  const OverallIcon = overallCfg.icon

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">
          Dashboard
        </h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
          Good morning, Becca. Here&apos;s your care overview for today.
        </p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border-border dark:border-gray-800 dark:bg-gray-900">
          <CardContent className="p-5">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                  Active Seniors
                </p>
                <p className="text-3xl font-bold text-gray-900 dark:text-white mt-1">
                  {stats.activeSeniors}
                </p>
              </div>
              <div className="w-9 h-9 rounded-lg bg-[#E8F7F2] dark:bg-[#1D9E75]/20 flex items-center justify-center">
                <Users className="h-4.5 w-4.5 text-[#1D9E75]" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border dark:border-gray-800 dark:bg-gray-900">
          <CardContent className="p-5">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                  Alerts Today
                </p>
                <p className="text-3xl font-bold text-gray-900 dark:text-white mt-1">
                  {stats.alertsToday}
                </p>
              </div>
              <div className="w-9 h-9 rounded-lg bg-red-50 dark:bg-red-900/20 flex items-center justify-center">
                <AlertTriangle className="h-4.5 w-4.5 text-red-500" />
              </div>
            </div>
            {activeAlerts.length > 0 && (
              <p className="text-xs text-red-500 mt-2 font-medium">
                {activeAlerts.length} active now
              </p>
            )}
          </CardContent>
        </Card>

        <Card className="border-border dark:border-gray-800 dark:bg-gray-900">
          <CardContent className="p-5">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                  Upcoming Appts
                </p>
                <p className="text-3xl font-bold text-gray-900 dark:text-white mt-1">
                  {stats.upcomingAppointments}
                </p>
              </div>
              <div className="w-9 h-9 rounded-lg bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center">
                <CalendarClock className="h-4.5 w-4.5 text-blue-500" />
              </div>
            </div>
            {upcomingAppts[0] && (
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-2 truncate">
                Next: {upcomingAppts[0].seniorName}
              </p>
            )}
          </CardContent>
        </Card>

        <Card
          className={`border ${overallCfg.bg} dark:border-gray-800 dark:bg-gray-900`}
        >
          <CardContent className="p-5">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                  Overall Status
                </p>
                <p className={`text-lg font-bold mt-1 ${overallCfg.color}`}>
                  {overallCfg.label}
                </p>
              </div>
              <div
                className={`w-9 h-9 rounded-lg flex items-center justify-center ${overallCfg.bg}`}
              >
                <OverallIcon className={`h-4.5 w-4.5 ${overallCfg.color}`} />
              </div>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
              {stats.activeSeniors} seniors monitored
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Senior status list */}
      <Card className="border-border dark:border-gray-800 dark:bg-gray-900">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base font-semibold">
              Senior Status
            </CardTitle>
            <Link
              href="/seniors"
              className="text-sm text-[#1D9E75] hover:text-[#187E5D] font-medium flex items-center gap-1"
            >
              View all
              <ChevronRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </CardHeader>
        <CardContent className="px-6 pb-2">
          <div className="divide-y divide-border dark:divide-gray-800">
            {seniors.map((senior) => {
              const cfg = statusConfig[senior.status]
              const activeAlertCount = senior.alerts.filter(
                (a) => a.status === "active"
              ).length
              // simple trend: compare last 2 heart rate readings
              const readings = senior.vitals.readings
              const trendVal =
                readings.length >= 2
                  ? readings[readings.length - 1].heartRate -
                    readings[readings.length - 2].heartRate
                  : 0

              return (
                <div
                  key={senior.id}
                  className="flex items-center justify-between py-3.5 group"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    {/* Status dot */}
                    <span
                      className={`w-2.5 h-2.5 rounded-full shrink-0 ${cfg.dot}`}
                    />
                    {/* Avatar placeholder */}
                    <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 text-sm font-semibold ${avatarBg[senior.status]}`}>
                      {senior.name
                        .split(" ")
                        .map((n) => n[0])
                        .join("")}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <Link
                          href={`/seniors/${senior.id}`}
                          className="text-sm font-medium text-gray-900 dark:text-white hover:text-[#1D9E75] dark:hover:text-[#4DC8A0] truncate"
                        >
                          {senior.name}
                        </Link>
                        {activeAlertCount > 0 && (
                          <Badge variant="destructive" className="text-[10px] px-1.5 py-0">
                            {activeAlertCount}
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                        {senior.primaryConditions.slice(0, 2).join(", ")}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-4 shrink-0 ml-4">
                    {/* Trend */}
                    <TrendIcon value={trendVal} />
                    {/* Status badge */}
                    <span
                      className={`text-xs font-medium px-2 py-0.5 rounded-full ${cfg.bg} ${cfg.color}`}
                    >
                      {cfg.label}
                    </span>
                    {/* Last seen */}
                    <div className="flex items-center gap-1 text-xs text-gray-400 dark:text-gray-500 min-w-[64px] justify-end">
                      <Clock className="h-3 w-3" />
                      {formatRelativeTime(senior.lastSeen)}
                    </div>
                    <Link
                      href={`/seniors/${senior.id}`}
                      className="opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <ChevronRight className="h-4 w-4 text-gray-400" />
                    </Link>
                  </div>
                </div>
              )
            })}
          </div>
        </CardContent>
      </Card>

      {/* Recent AI summaries */}
      <Card className="border-border dark:border-gray-800 dark:bg-gray-900">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-[#1D9E75]" />
              <CardTitle className="text-base font-semibold">
                Recent AI Summaries
              </CardTitle>
            </div>
            <Link
              href="/insights"
              className="text-sm text-[#1D9E75] hover:text-[#187E5D] font-medium flex items-center gap-1"
            >
              View all
              <ChevronRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </CardHeader>
        <CardContent className="px-6 pb-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {recentSummaries.map((summary) => {
              const summaryStatus = seniors.find((s) => s.id === summary.seniorId)?.status ?? "routine"
              const urgencyBadge =
                summary.urgency === "critical"
                  ? "destructive"
                  : summary.urgency === "monitor"
                  ? "warning"
                  : "info"
              const urgencyLabel =
                summary.urgency === "critical"
                  ? "Critical"
                  : summary.urgency === "monitor"
                  ? "Monitor"
                  : "Routine"
              return (
                <div
                  key={summary.id}
                  className="flex flex-col gap-3 p-4 rounded-xl border border-border dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 text-xs font-semibold ${avatarBg[summaryStatus]}`}>
                        {summary.seniorName
                          .split(" ")
                          .map((n) => n[0])
                          .join("")}
                      </div>
                      <span className="text-sm font-medium text-gray-900 dark:text-white truncate">
                        {summary.seniorName}
                      </span>
                    </div>
                    <Badge variant={urgencyBadge} className="shrink-0">
                      {urgencyLabel}
                    </Badge>
                  </div>
                  <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed line-clamp-3">
                    {summary.plainTextSummary}
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {summary.sourceTags.slice(0, 3).map((tag) => (
                      <span
                        key={tag}
                        className="text-[10px] px-2 py-0.5 rounded-full bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300 font-medium"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                  {/* Quick actions */}
                  <div className="flex items-center gap-2 pt-1 border-t border-border dark:border-gray-700">
                    <Link href={`/seniors/${summary.seniorId}`}>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs px-2 text-gray-600 dark:text-gray-300"
                      >
                        View Profile
                      </Button>
                    </Link>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs px-2 text-gray-600 dark:text-gray-300"
                    >
                      <Phone className="h-3 w-3 mr-1" />
                      Contact
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs px-2 text-amber-600 dark:text-amber-400"
                    >
                      <Flag className="h-3 w-3 mr-1" />
                      Flag
                    </Button>
                  </div>
                </div>
              )
            })}
          </div>
        </CardContent>
      </Card>

      {/* Active alerts preview */}
      {activeAlerts.length > 0 && (
        <Card className="border-red-200 dark:border-red-900/50 bg-red-50/50 dark:bg-red-900/10 dark:bg-gray-900">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-red-500" />
                <CardTitle className="text-base font-semibold text-red-700 dark:text-red-400">
                  Active Alerts
                </CardTitle>
              </div>
              <Link
                href="/alerts"
                className="text-sm text-red-600 dark:text-red-400 hover:text-red-700 font-medium flex items-center gap-1"
              >
                Manage all
                <ChevronRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          </CardHeader>
          <CardContent className="px-6 pb-6 space-y-2">
            {activeAlerts.slice(0, 3).map((alert) => (
              <div
                key={alert.id}
                className="flex items-start gap-3 p-3 rounded-lg bg-white dark:bg-gray-800 border border-red-100 dark:border-red-900/30"
              >
                <Badge
                  variant={severityBadge[alert.severity]}
                  className="shrink-0 mt-0.5"
                >
                  {severityLabel[alert.severity] ?? alert.severity}
                </Badge>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 dark:text-white">
                    {alert.title}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                    {alert.seniorName} · {formatRelativeTime(alert.timestamp)}
                  </p>
                  <p className="text-xs text-gray-600 dark:text-gray-300 mt-1 line-clamp-1">
                    {alert.aiExplanation}
                  </p>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Upcoming appointments */}
      <Card className="border-border dark:border-gray-800 dark:bg-gray-900">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold">
            Upcoming Appointments
          </CardTitle>
        </CardHeader>
        <CardContent className="px-6 pb-4 space-y-3">
          {upcomingAppts.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400">
              No upcoming appointments.
            </p>
          ) : (
            upcomingAppts.map((appt) => (
              <div
                key={appt.id}
                className="flex flex-col gap-0.5 p-3 rounded-lg bg-gray-50 dark:bg-gray-800/50 border border-border dark:border-gray-700"
              >
                <p className="text-sm font-medium text-gray-900 dark:text-white">
                  {appt.title}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {appt.seniorName} · {appt.provider}
                </p>
                <p className="text-xs text-[#1D9E75] font-medium mt-1">
                  {formatDateTime(appt.dateTime)}
                </p>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  )
}
