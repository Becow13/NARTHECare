import { notFound } from "next/navigation"
import Link from "next/link"
import {
  ArrowLeft,
  Heart,
  Activity,
  Moon,
  Footprints,
  Droplets,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Phone,
  Mail,
  Wifi,
  WifiOff,
  User,
  Building2,
  Sparkles,
  ChevronRight,
} from "lucide-react"
import { getSeniorById } from "@/lib/mock-data"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { Sparkline } from "@/components/sparkline"
import { DataFreshnessBadge } from "@/components/data-freshness-badge"
import { formatRelativeTime, formatDateTime, formatDate } from "@/lib/utils"

const statusConfig = {
  stable: {
    label: "Stable",
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
  alert: {
    label: "Alert",
    color: "text-red-600 dark:text-red-400",
    bg: "bg-red-50 dark:bg-red-900/20",
    dot: "bg-red-500",
  },
}

const alertSeverityBadge = {
  critical: "destructive" as const,
  moderate: "warning" as const,
  low: "info" as const,
}

const alertStatusIcon = {
  active: <span className="w-2 h-2 rounded-full bg-red-500 inline-block" />,
  acknowledged: <span className="w-2 h-2 rounded-full bg-amber-500 inline-block" />,
  resolved: <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />,
}

const dataSourceIcon = {
  ehr: "📋",
  wearable: "⌚",
  camera: "📷",
  fall_detection: "🛡️",
  medication: "💊",
}

export default function SeniorProfilePage({
  params,
}: {
  params: { id: string }
}) {
  const senior = getSeniorById(params.id)
  if (!senior) notFound()

  const cfg = statusConfig[senior.status]
  const lastReadings = senior.vitals.readings.slice(-7)
  const mostRecentSummary = senior.summaries[0]
  const sortedAlerts = [...senior.alerts].sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  )

  const latestReading = lastReadings[lastReadings.length - 1]

  const avg = (vals: number[]) =>
    vals.length ? Math.round(vals.reduce((s, v) => s + v, 0) / vals.length) : null

  const avgHeartRate = avg(lastReadings.map((r) => r.heartRate))
  const avgSysBP = avg(lastReadings.map((r) => r.bloodPressureSys))
  const avgDiaBP = avg(lastReadings.map((r) => r.bloodPressureDia))
  const avgSleep =
    lastReadings.length
      ? Math.round((lastReadings.reduce((s, r) => s + r.sleepHours, 0) / lastReadings.length) * 10) / 10
      : null
  const avgActivity = avg(lastReadings.map((r) => r.activityMinutes))

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Back nav */}
      <Link
        href="/seniors"
        className="inline-flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Seniors
      </Link>

      {/* Profile header */}
      <Card className="border-border dark:border-gray-800 dark:bg-gray-900">
        <CardContent className="p-6">
          <div className="flex flex-col sm:flex-row sm:items-start gap-5">
            {/* Avatar */}
            <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-[#1D9E75]/20 to-[#1D9E75]/5 dark:from-[#1D9E75]/30 dark:to-[#1D9E75]/10 flex items-center justify-center shrink-0 text-2xl font-bold text-[#1D9E75]">
              {senior.name.split(" ").map((n) => n[0]).join("")}
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-start gap-3">
                <div>
                  <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                    {senior.name}
                  </h1>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                    Age {senior.age} · {senior.location}
                  </p>
                </div>
                <span
                  className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium ${cfg.bg} ${cfg.color}`}
                >
                  <span className={`w-2 h-2 rounded-full ${cfg.dot}`} />
                  {cfg.label}
                </span>
              </div>

              {/* Conditions */}
              <div className="flex flex-wrap gap-2 mt-3">
                {senior.primaryConditions.map((cond) => (
                  <span
                    key={cond}
                    className="text-xs px-2.5 py-1 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 font-medium"
                  >
                    {cond}
                  </span>
                ))}
              </div>

              {/* Last seen */}
              <div className="flex items-center gap-1.5 mt-3 text-xs text-gray-500 dark:text-gray-400">
                <Clock className="h-3.5 w-3.5" />
                Last seen {formatRelativeTime(senior.lastSeen)}
              </div>

              {/* Quick actions */}
              <div className="flex flex-wrap gap-2 mt-4">
                <Button size="sm" variant="outline" className="text-xs h-8">
                  <Phone className="h-3.5 w-3.5 mr-1.5" />
                  Contact Care Team
                </Button>
                <Button size="sm" variant="outline" className="text-xs h-8">
                  <AlertTriangle className="h-3.5 w-3.5 mr-1.5 text-amber-500" />
                  Flag for Review
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Today's Latest Reading */}
      {latestReading && (
        <div>
          <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
            <h2 className="text-base font-semibold text-gray-900 dark:text-white">
              Vitals — Today
            </h2>
            <span className="text-xs text-gray-400 dark:text-gray-500">
              last updated{" "}
              <span className="text-gray-600 dark:text-gray-300 font-medium">
                {formatRelativeTime(latestReading.timestamp)}
              </span>
            </span>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Today — Heart Rate */}
            <Card className="border-[#1D9E75]/20 dark:border-[#1D9E75]/20 bg-[#1D9E75]/[0.04] dark:bg-[#1D9E75]/[0.08]">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Heart className="h-4 w-4 text-red-400" />
                  <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                    Heart Rate
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className={`w-2 h-2 rounded-full shrink-0 ${
                      latestReading.heartRate >= 60 && latestReading.heartRate <= 100
                        ? "bg-emerald-500"
                        : latestReading.heartRate >= 50 && latestReading.heartRate <= 110
                        ? "bg-amber-500"
                        : "bg-red-500"
                    }`}
                  />
                  <p className="text-2xl font-bold text-gray-900 dark:text-white">
                    {latestReading.heartRate}
                    <span className="text-sm font-normal text-gray-500 ml-1">bpm</span>
                  </p>
                </div>
                <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-0.5">latest reading</p>
              </CardContent>
            </Card>

            {/* Today — Blood Pressure */}
            <Card className="border-[#1D9E75]/20 dark:border-[#1D9E75]/20 bg-[#1D9E75]/[0.04] dark:bg-[#1D9E75]/[0.08]">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Activity className="h-4 w-4 text-purple-400" />
                  <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                    Blood Pressure
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className={`w-2 h-2 rounded-full shrink-0 ${
                      latestReading.bloodPressureSys < 130
                        ? "bg-emerald-500"
                        : latestReading.bloodPressureSys <= 139
                        ? "bg-amber-500"
                        : "bg-red-500"
                    }`}
                  />
                  <p className="text-2xl font-bold text-gray-900 dark:text-white">
                    {latestReading.bloodPressureSys}/{latestReading.bloodPressureDia}
                    <span className="text-sm font-normal text-gray-500 ml-1">mmHg</span>
                  </p>
                </div>
                <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-0.5">latest reading</p>
              </CardContent>
            </Card>

            {/* Today — Sleep */}
            <Card className="border-[#1D9E75]/20 dark:border-[#1D9E75]/20 bg-[#1D9E75]/[0.04] dark:bg-[#1D9E75]/[0.08]">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Moon className="h-4 w-4 text-blue-400" />
                  <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                    Sleep
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className={`w-2 h-2 rounded-full shrink-0 ${
                      latestReading.sleepHours >= 7
                        ? "bg-emerald-500"
                        : latestReading.sleepHours >= 5
                        ? "bg-amber-500"
                        : "bg-red-500"
                    }`}
                  />
                  <p className="text-2xl font-bold text-gray-900 dark:text-white">
                    {latestReading.sleepHours}
                    <span className="text-sm font-normal text-gray-500 ml-1">hrs</span>
                  </p>
                </div>
                <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-0.5">latest reading</p>
              </CardContent>
            </Card>

            {/* Today — Activity */}
            <Card className="border-[#1D9E75]/20 dark:border-[#1D9E75]/20 bg-[#1D9E75]/[0.04] dark:bg-[#1D9E75]/[0.08]">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Footprints className="h-4 w-4 text-[#1D9E75]" />
                  <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                    Activity
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className={`w-2 h-2 rounded-full shrink-0 ${
                      latestReading.activityMinutes >= 30
                        ? "bg-emerald-500"
                        : latestReading.activityMinutes >= 15
                        ? "bg-amber-500"
                        : "bg-red-500"
                    }`}
                  />
                  <p className="text-2xl font-bold text-gray-900 dark:text-white">
                    {latestReading.activityMinutes}
                    <span className="text-sm font-normal text-gray-500 ml-1">min</span>
                  </p>
                </div>
                <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-0.5">latest reading</p>
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {/* Vitals panel */}
      <div>
        <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
          <h2 className="text-base font-semibold text-gray-900 dark:text-white">
            Vitals — Last 7 Days
          </h2>
          <div className="flex items-center gap-3">
            {latestReading && (
              <span className="text-xs text-gray-400 dark:text-gray-500">
                Last reading:{" "}
                <span className="text-gray-600 dark:text-gray-300 font-medium">
                  {formatDateTime(latestReading.timestamp)}
                </span>
              </span>
            )}
            <DataFreshnessBadge isLive={false} />
          </div>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Heart rate */}
          <Card className="border-border dark:border-gray-800 dark:bg-gray-900">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-2">
                <Heart className="h-4 w-4 text-red-400" />
                <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                  Heart Rate
                </span>
              </div>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">
                {avgHeartRate ?? "—"}
                <span className="text-sm font-normal text-gray-500 ml-1">bpm</span>
              </p>
              <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-0.5">7-day avg</p>
              <div className="mt-2 h-10">
                <Sparkline
                  data={lastReadings.map((r) => r.heartRate)}
                  color="#ef4444"
                />
              </div>
            </CardContent>
          </Card>

          {/* Blood pressure */}
          <Card className="border-border dark:border-gray-800 dark:bg-gray-900">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-2">
                <Activity className="h-4 w-4 text-purple-400" />
                <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                  Blood Pressure
                </span>
              </div>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">
                {avgSysBP && avgDiaBP ? `${avgSysBP}/${avgDiaBP}` : "—"}
                <span className="text-sm font-normal text-gray-500 ml-1">mmHg</span>
              </p>
              <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-0.5">7-day avg</p>
              <div className="mt-2 h-10">
                <Sparkline
                  data={lastReadings.map((r) => r.bloodPressureSys)}
                  color="#a855f7"
                />
              </div>
            </CardContent>
          </Card>

          {/* Sleep */}
          <Card className="border-border dark:border-gray-800 dark:bg-gray-900">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-2">
                <Moon className="h-4 w-4 text-blue-400" />
                <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                  Sleep
                </span>
              </div>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">
                {avgSleep ?? "—"}
                <span className="text-sm font-normal text-gray-500 ml-1">hrs</span>
              </p>
              <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-0.5">7-day avg</p>
              <div className="mt-2 h-10">
                <Sparkline
                  data={lastReadings.map((r) => r.sleepHours)}
                  color="#3b82f6"
                />
              </div>
            </CardContent>
          </Card>

          {/* Activity */}
          <Card className="border-border dark:border-gray-800 dark:bg-gray-900">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-2">
                <Footprints className="h-4 w-4 text-[#1D9E75]" />
                <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                  Activity
                </span>
              </div>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">
                {avgActivity ?? "—"}
                <span className="text-sm font-normal text-gray-500 ml-1">min</span>
              </p>
              <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-0.5">7-day avg</p>
              <div className="mt-2 h-10">
                <Sparkline
                  data={lastReadings.map((r) => r.activityMinutes)}
                  color="#1D9E75"
                />
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Alert history timeline */}
        <div className="lg:col-span-2 space-y-4">
          <h2 className="text-base font-semibold text-gray-900 dark:text-white">
            Alert History
          </h2>
          {sortedAlerts.length === 0 ? (
            <Card className="border-border dark:border-gray-800 dark:bg-gray-900">
              <CardContent className="p-6 text-center">
                <CheckCircle2 className="h-8 w-8 text-emerald-400 mx-auto mb-2" />
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  No alerts on record
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="relative">
              {/* Timeline line */}
              <div className="absolute left-[15px] top-2 bottom-2 w-px bg-border dark:bg-gray-800" />
              <div className="space-y-4">
                {sortedAlerts.map((alert) => (
                  <div key={alert.id} className="flex gap-4 relative">
                    {/* Timeline node */}
                    <div className="relative flex items-start justify-center w-8 shrink-0 pt-3">
                      <div className="z-10 flex items-center justify-center">
                        {alertStatusIcon[alert.status]}
                      </div>
                    </div>
                    <Card className="flex-1 border-border dark:border-gray-800 dark:bg-gray-900">
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between gap-3 flex-wrap">
                          <div className="flex items-center gap-2 flex-wrap">
                            <Badge variant={alertSeverityBadge[alert.severity]}>
                              {alert.severity}
                            </Badge>
                            <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
                              {alert.title}
                            </h3>
                          </div>
                          <span className="text-xs text-gray-400 dark:text-gray-500 shrink-0">
                            {formatDateTime(alert.timestamp)}
                          </span>
                        </div>
                        <p className="text-xs text-gray-600 dark:text-gray-300 mt-2 leading-relaxed">
                          {alert.aiExplanation}
                        </p>
                        {alert.actionTaken && (
                          <div className="mt-2 pt-2 border-t border-border dark:border-gray-800">
                            <p className="text-xs text-gray-500 dark:text-gray-400">
                              <span className="font-medium">Action:</span>{" "}
                              {alert.actionTaken}
                            </p>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right column */}
        <div className="space-y-5">
          {/* AI summary */}
          {mostRecentSummary && (
            <Card className="border-border dark:border-gray-800 dark:bg-gray-900">
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-[#1D9E75]" />
                  <CardTitle className="text-sm font-semibold">
                    Latest AI Summary
                  </CardTitle>
                </div>
                <p className="text-xs text-gray-400 dark:text-gray-500">
                  {formatRelativeTime(mostRecentSummary.generatedAt)}
                </p>
              </CardHeader>
              <CardContent className="px-5 pb-5">
                <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed">
                  {mostRecentSummary.plainTextSummary}
                </p>
                {mostRecentSummary.recommendedActions.length > 0 && (
                  <>
                    <Separator className="my-3" />
                    <p className="text-xs font-semibold text-gray-700 dark:text-gray-300 mb-2 uppercase tracking-wide">
                      Recommended
                    </p>
                    <ul className="space-y-1.5">
                      {mostRecentSummary.recommendedActions.slice(0, 3).map((action, i) => (
                        <li
                          key={i}
                          className="flex items-start gap-2 text-xs text-gray-600 dark:text-gray-400"
                        >
                          <span className="w-1.5 h-1.5 rounded-full bg-[#1D9E75] shrink-0 mt-1" />
                          {action}
                        </li>
                      ))}
                    </ul>
                  </>
                )}
                <div className="flex flex-wrap gap-1.5 mt-3">
                  {mostRecentSummary.sourceTags.map((tag) => (
                    <span
                      key={tag}
                      className="text-[10px] px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
                <div className="mt-4">
                  <Button size="sm" variant="outline" className="w-full text-xs h-8">
                    View Full Summary
                    <ChevronRight className="h-3.5 w-3.5 ml-1" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Data sources */}
          <Card className="border-border dark:border-gray-800 dark:bg-gray-900">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold">
                Connected Data Sources
              </CardTitle>
            </CardHeader>
            <CardContent className="px-5 pb-5 space-y-2.5">
              {senior.dataSources.map((source) => (
                <div
                  key={source.id}
                  className="flex items-center justify-between gap-3"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="text-base shrink-0">
                      {dataSourceIcon[source.type]}
                    </span>
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-gray-900 dark:text-white truncate">
                        {source.name}
                      </p>
                      <p className="text-[10px] text-gray-500 dark:text-gray-400">
                        {source.connected
                          ? `Synced ${formatRelativeTime(source.lastSync)}`
                          : "Disconnected"}
                      </p>
                    </div>
                  </div>
                  {source.connected ? (
                    <Wifi className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                  ) : (
                    <WifiOff className="h-3.5 w-3.5 text-red-400 shrink-0" />
                  )}
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Care team */}
          <Card className="border-border dark:border-gray-800 dark:bg-gray-900">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold">Care Team</CardTitle>
            </CardHeader>
            <CardContent className="px-5 pb-5 space-y-4">
              {senior.careTeam.map((member) => (
                <div key={member.id} className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-full bg-[#1D9E75]/10 flex items-center justify-center shrink-0 text-xs font-semibold text-[#1D9E75]">
                    {member.name.split(" ").map((n) => n[0]).join("")}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900 dark:text-white">
                      {member.name}
                    </p>
                    <p className="text-xs text-[#1D9E75] font-medium">
                      {member.role}
                    </p>
                    {member.organization && (
                      <div className="flex items-center gap-1 mt-0.5">
                        <Building2 className="h-3 w-3 text-gray-400" />
                        <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                          {member.organization}
                        </p>
                      </div>
                    )}
                    <div className="flex items-center gap-3 mt-1.5">
                      <a
                        href={`tel:${member.phone}`}
                        className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400 hover:text-[#1D9E75]"
                      >
                        <Phone className="h-3 w-3" />
                        {member.phone}
                      </a>
                    </div>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
