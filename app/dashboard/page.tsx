import Link from "next/link"
import {
  Users,
  AlertTriangle,
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
import { formatRelativeTime } from "@/lib/utils"

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

const avatarBg: Record<string, string> = {
  critical: "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400",
  monitor:  "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400",
  routine:  "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400",
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
  if (value > 0) return <TrendingUp className="h-3.5 w-3.5 text-emerald-500" />
  if (value < 0) return <TrendingDown className="h-3.5 w-3.5 text-red-500" />
  return <Minus className="h-3.5 w-3.5 text-amber-400" />
}

const GRID = "grid grid-cols-[12px_36px_1fr_80px_80px_100px_100px_90px] gap-x-4 items-center"

export default function CareHubPage() {
  const stats           = MOCK_DASHBOARD_STATS
  const seniors         = MOCK_SENIORS
  const activeAlerts    = MOCK_ALERTS.filter((a) => a.status === "active")
  const recentSummaries = MOCK_SUMMARIES.slice(0, 3)

  const overallCfg  = overallStatusConfig[stats.overallStatus]
  const OverallIcon = overallCfg.icon

  return (
    <div className="max-w-7xl mx-auto space-y-6">

      {/* Page header */}
      <div>
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">Care Hub</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
          Hello Becca! Welcome To Your Care Circle Care Hub!
        </p>
      </div>


      {/* ── Slogan Banner ── */}
      <div style={{position: 'relative', borderRadius: '16px', overflow: 'hidden', background: '#0d0f2b', padding: '28px 36px'}}>
        <div style={{position: 'absolute', top: 0, left: 0, width: '5px', height: '100%', background: '#3B5BDB'}} />
        <div style={{position: 'absolute', top: 0, right: 0, width: '5px', height: '100%', background: '#91A7FF'}} />
        <div style={{position: 'absolute', top: '-30px', left: '-30px', width: '120px', height: '120px', borderRadius: '50%', background: '#3B5BDB', opacity: 0.3}} />
        <div style={{position: 'absolute', bottom: '-40px', right: '-20px', width: '150px', height: '150px', borderRadius: '50%', background: '#91A7FF', opacity: 0.15}} />
        <div style={{textAlign: 'center', position: 'relative'}}>
          <div style={{fontSize: '22px', fontWeight: 700, color: '#EEF0FF', letterSpacing: '3px', marginBottom: '8px'}}>NARTHECare</div>
          <div style={{height: '2px', background: '#3B5BDB', opacity: 0.5, width: '200px', margin: '0 auto 12px'}} />
          <div style={{fontSize: '30px', fontWeight: 700, color: '#EEF0FF', lineHeight: 1.3}}>Clear AIs,</div>
          <div style={{fontSize: '30px', fontWeight: 700, color: '#91A7FF', lineHeight: 1.3}}>Full Care,</div>
          <div style={{fontSize: '30px', fontWeight: 700, color: '#3B5BDB', lineHeight: 1.3}}>Can't Lose.</div>
          <div style={{height: '2px', background: '#3B5BDB', opacity: 0.5, width: '200px', margin: '12px auto 12px'}} />
          <div style={{fontSize: '11px', fontWeight: 600, color: '#91A7FF', letterSpacing: '2px'}}>◆ UNIFIED ◆ INTELLIGENT ◆ CAREGIVER FOCUSED</div>
        </div>
      </div>

      {/* Stat cards */}
      <div className="flex justify-center gap-4">

        {/* Active Care Members */}
        <Card className="border-border dark:border-gray-800 dark:bg-gray-900 w-56">
          <CardContent className="p-4">
            <div className="flex items-center justify-between gap-6">
              <div>
                <p className="text-[10px] font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                  Active Care Members
                </p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white mt-0.5">
                  {stats.activeSeniors}
                </p>
              </div>
              <div className="w-9 h-9 rounded-lg bg-[#EEF0FF] dark:bg-[#3B5BDB]/20 flex items-center justify-center shrink-0">
                <Users className="h-4 w-4 text-[#3B5BDB]" />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Alerts Today */}
        <Card className="border-border dark:border-gray-800 dark:bg-gray-900 w-56">
          <CardContent className="p-4">
            <div className="flex items-center justify-between gap-6">
              <div>
                <p className="text-[10px] font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                  Alerts Today
                </p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white mt-0.5">
                  {stats.alertsToday}
                </p>
                {activeAlerts.length > 0 && (
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 font-medium">
                    {activeAlerts.length} active now
                  </p>
                )}
              </div>
              <div className="w-9 h-9 rounded-lg bg-[#EEF0FF] dark:bg-[#3B5BDB]/20 flex items-center justify-center shrink-0">
                <AlertTriangle className="h-4 w-4 text-[#3B5BDB]" />
              </div>
            </div>
          </CardContent>
        </Card>

      </div>

      {/* Care Member Snapshot */}
      <Card className="border-border dark:border-gray-800 dark:bg-gray-900">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base font-semibold">
              Care Member Snapshot
            </CardTitle>
            <Link
              href="/seniors"
              className="text-sm text-[#3B5BDB] hover:text-[#2F4AC4] font-medium flex items-center gap-1"
            >
              View all <ChevronRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </CardHeader>
        <CardContent className="px-6 pb-4">

          {/* Header row */}
          <div className={`${GRID} pb-2 border-b border-gray-100 dark:border-gray-800 text-[10px] font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wide`}>
            <span />
            <span />
            <span>Care Member</span>
            <span className="text-center">Active Alerts</span>
            <span className="text-center">Appointments</span>
            <span className="text-center leading-tight">Overall Well-Being Journey</span>
            <span className="text-center leading-tight">Today's Well-Being</span>
            <span className="text-center">Last Update</span>
          </div>

          {/* Data rows */}
          {seniors.map((senior) => {
            const cfg = statusConfig[senior.status]
            const alertCount = senior.alerts.filter((a) => a.status === "active").length
            const now   = new Date()
            const in48h = new Date(Date.now() + 48 * 60 * 60 * 1000)
            const appts = MOCK_APPOINTMENTS.filter(
              (a) => a.seniorId === senior.id && new Date(a.dateTime) > now
            )
            const apptCount = appts.length
            const readings = senior.vitals.readings
            const trendVal =
              readings.length >= 2
                ? readings[readings.length - 1].heartRate -
                  readings[readings.length - 2].heartRate
                : 0

            return (
              <Link
                key={senior.id}
                href={`/seniors/${senior.id}`}
                className={`${GRID} py-3.5 border-b border-gray-50 dark:border-gray-800/60 hover:bg-gray-50 dark:hover:bg-gray-800/40 transition-colors`}
              >
                <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${cfg.dot}`} />

                <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-semibold shrink-0 ${avatarBg[senior.status]}`}>
                  {senior.name.split(" ").map((n) => n[0]).join("")}
                </div>

                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                    {senior.name}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                    {senior.primaryConditions.slice(0, 2).join(", ")}
                  </p>
                </div>

                <div className="flex justify-center">
                  {alertCount > 0 ? (
                    <Badge
                      variant="secondary"
                      className="text-[10px] px-1.5 py-0 rounded-full min-w-[20px] justify-center bg-slate-800 text-white dark:bg-slate-700 dark:text-white border-0"
                    >
                      {alertCount}
                    </Badge>
                  ) : (
                    <span className="text-gray-300 dark:text-gray-600 text-sm">—</span>
                  )}
                </div>

                <div className="flex justify-center">
                  {apptCount > 0 ? (
                    <Badge
                      variant="secondary"
                      className="text-[10px] px-1.5 py-0 rounded-full min-w-[20px] justify-center bg-slate-800 text-white dark:bg-slate-700 dark:text-white border-0"
                    >
                      {apptCount}
                    </Badge>
                  ) : (
                    <span className="text-gray-300 dark:text-gray-600 text-sm">—</span>
                  )}
                </div>

                <div className="flex justify-center">
                  <TrendIcon value={trendVal} />
                </div>

                <div className="flex justify-center">
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${cfg.bg} ${cfg.color}`}>
                    {cfg.label}
                  </span>
                </div>

                <div className="flex items-center justify-center gap-1 text-xs text-gray-400 dark:text-gray-500">
                  <Clock className="h-3 w-3 shrink-0" />
                  <span className="truncate">{formatRelativeTime(senior.lastSeen)}</span>
                </div>
              </Link>
            )
          })}

        </CardContent>
      </Card>

      {/* Recent AI Summaries */}
      <Card className="border-border dark:border-gray-800 dark:bg-gray-900">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-[#3B5BDB]" />
              <CardTitle className="text-base font-semibold">Recent AI Summaries</CardTitle>
            </div>
            <Link
              href="/insights"
              className="text-sm text-[#3B5BDB] hover:text-[#2F4AC4] font-medium flex items-center gap-1"
            >
              View all <ChevronRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </CardHeader>
        <CardContent className="px-6 pb-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {recentSummaries.map((summary) => {
              const summaryStatus = seniors.find((s) => s.id === summary.seniorId)?.status ?? "routine"
              const urgencyBadge =
                summary.urgency === "critical" ? "destructive"
                : summary.urgency === "monitor"  ? "warning"
                : "routine"
              const urgencyLabel =
                summary.urgency === "critical" ? "Critical"
                : summary.urgency === "monitor"  ? "Monitor"
                : "Routine"
              return (
                <div
                  key={summary.id}
                  className="flex flex-col gap-3 p-4 rounded-xl border border-border dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 text-xs font-semibold ${avatarBg[summaryStatus]}`}>
                        {summary.seniorName.split(" ").map((n) => n[0]).join("")}
                      </div>
                      <span className="text-sm font-medium text-gray-900 dark:text-white truncate">
                        {summary.seniorName}
                      </span>
                    </div>
                    {urgencyBadge === "routine" ? (
                      <span className="shrink-0 text-xs font-medium px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400">{urgencyLabel}</span>
                    ) : (
                      <Badge variant={urgencyBadge} className="shrink-0">{urgencyLabel}</Badge>
                    )}
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
                  <div className="flex items-center gap-2 pt-1 border-t border-border dark:border-gray-700">
                    <Link href={`/seniors/${summary.seniorId}`}>
                      <Button variant="ghost" size="sm" className="h-7 text-xs px-2 text-gray-600 dark:text-gray-300">
                        View Profile
                      </Button>
                    </Link>
                    <Button variant="ghost" size="sm" className="h-7 text-xs px-2 text-gray-600 dark:text-gray-300">
                      <Phone className="h-3 w-3 mr-1" /> Contact
                    </Button>
                    <Button variant="ghost" size="sm" className="h-7 text-xs px-2 text-amber-600 dark:text-amber-400">
                      <Flag className="h-3 w-3 mr-1" /> Flag
                    </Button>
                  </div>
                </div>
              )
            })}
          </div>
        </CardContent>
      </Card>

    </div>
  )
}
