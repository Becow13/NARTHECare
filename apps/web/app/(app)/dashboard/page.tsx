"use client"
import Link from "next/link"
import { useRouter } from "next/navigation"
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

const GRID = "grid grid-cols-[12px_36px_minmax(150px,25%)_minmax(60px,8%)_minmax(60px,8%)_minmax(80px,10%)_minmax(80px,10%)_minmax(70px,8%)_1fr] gap-x-3 items-start"

export default function CareHubPage() {
  const router = useRouter()
  const stats           = MOCK_DASHBOARD_STATS
  const seniors         = MOCK_SENIORS
  const activeAlerts    = MOCK_ALERTS.filter((a) => a.status === "active")
  const recentSummaries = MOCK_SUMMARIES.slice(0, 3)

  const overallCfg  = overallStatusConfig[stats.overallStatus]
  const OverallIcon = overallCfg.icon

  return (
   <div className="w-full max-w-7xl mx-auto space-y-6">

      {/* Page header */}
      <div>
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">Care Hub</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
          Hello Becca! Welcome To Your Care Circle Care Hub!
        </p>
      </div>


      {/* ── Slogan Banner ── */}
      <div style={{position: 'relative', borderRadius: '16px', overflow: 'hidden', background: '#0d0f2b', padding: '14px 18px'}}>
        <div style={{position: 'absolute', top: 0, left: 0, width: '5px', height: '100%', background: '#3B5BDB'}} />
        <div style={{position: 'absolute', top: 0, right: 0, width: '5px', height: '100%', background: '#91A7FF'}} />
        <div style={{position: 'absolute', top: '-15px', left: '-15px', width: '60px', height: '60px', borderRadius: '50%', background: '#3B5BDB', opacity: 0.3}} />
        <div style={{position: 'absolute', bottom: '-20px', right: '-10px', width: '75px', height: '75px', borderRadius: '50%', background: '#91A7FF', opacity: 0.15}} />
        <div style={{textAlign: 'center', position: 'relative'}}>
          <div style={{fontSize: '13px', fontWeight: 700, color: '#EEF0FF', letterSpacing: '2px',  marginBottom: '4px'}}>NARTHECare</div>
          <div style={{height: '2px', background: '#3B5BDB', opacity: 0.5, width: '100px', margin: '0 auto 6px'}} />
          <div style={{fontSize: '15px', fontWeight: 700, color: '#EEF0FF', lineHeight: 1.3}}>Clear AIs,</div>
          <div style={{fontSize: '15px', fontWeight: 700, color: '#91A7FF', lineHeight: 1.3}}>Full Care,</div>
          <div style={{fontSize: '15px', fontWeight: 700, color: '#3B5BDB', lineHeight: 1.3}}>Can't Lose.</div>
          <div style={{height: '2px', background: '#3B5BDB', opacity: 0.5, width: '100px', margin: '6px auto 6px'}} />
          <div style={{fontSize: '9px', fontWeight: 600, color: '#91A7FF', letterSpacing: '1px'}}>◆ UNIFIED ◆ INTELLIGENT ◆ CAREGIVER FOCUSED</div>
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
<span className="text-center">AI Summary</span>
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

            const rowHref = `/seniors/${senior.id}`
            return (
              // Outer row is a div (not <Link>) so the inner Links below
              // are not nested inside an <a>. HTML forbids <a> inside <a>;
              // browsers re-parse the DOM and React's hydration sees a
              // mismatch. We keep the "click anywhere on the row" UX via
              // role="link" + onClick + keyboard handler.
              <div
                key={senior.id}
                role="link"
                tabIndex={0}
                onClick={() => router.push(rowHref)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault()
                    router.push(rowHref)
                  }
                }}
                className={`${GRID} py-3.5 border-b border-gray-50 dark:border-gray-800/60 hover:bg-gray-50 dark:hover:bg-gray-800/40 transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[#3B5BDB] rounded`}
              >
               <span className={`w-2.5 h-2.5 rounded-full shrink-0 self-start mt-3 ${cfg.dot}`} />

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
                    <Link
                      href={`/alerts?seniorId=${senior.id}`}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Badge
                        variant="secondary"
                        className="text-[10px] px-1.5 py-0 rounded-full min-w-[20px] justify-center bg-slate-800 text-white dark:bg-slate-700 dark:text-white border-0 hover:bg-slate-600 cursor-pointer"
                      >
                        {alertCount}
                      </Badge>
                    </Link>
                  ) : (
                    <span className="text-gray-300 dark:text-gray-600 text-sm">—</span>
                  )}
                </div>

               <div className="flex justify-center">
                  {apptCount > 0 ? (
                    <Link
                      href={`/appointments?seniorId=${senior.id}`}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Badge
                        variant="secondary"
                        className="text-[10px] px-1.5 py-0 rounded-full min-w-[20px] justify-center bg-slate-800 text-white dark:bg-slate-700 dark:text-white border-0 hover:bg-slate-600 cursor-pointer"
                      >
                        {apptCount}
                      </Badge>
                    </Link>
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

                <Link
                  href={`/insights?seniorId=${senior.id}`}
                  onClick={(e) => e.stopPropagation()}
                  className="py-1 block"
                >
                  <p className="text-xs text-gray-600 dark:text-gray-300 line-clamp-2 leading-relaxed hover:text-[#3B5BDB] cursor-pointer">
                    {MOCK_SUMMARIES.find((s) => s.seniorId === senior.id)?.plainTextSummary ?? "No summary available."}
                  </p>
                </Link>
              </div>
            )
          })}

        </CardContent>
      </Card>

      
    </div>
  )
}
