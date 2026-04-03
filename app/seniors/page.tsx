import Link from "next/link"
import { ChevronRight, Clock, AlertTriangle } from "lucide-react"
import { MOCK_SENIORS } from "@/lib/mock-data"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { formatRelativeTime } from "@/lib/utils"

const statusConfig = {
  routine: { label: "Routine", dot: "bg-emerald-500", badge: "success" as const },
  monitor: { label: "Monitor", dot: "bg-amber-500", badge: "warning" as const },
  critical: { label: "Critical", dot: "bg-red-500", badge: "destructive" as const },
}

const avatarBg: Record<string, string> = {
  critical: "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400",
  monitor:  "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400",
  routine:  "bg-[#1D9E75]/10 dark:bg-[#1D9E75]/20 text-[#1D9E75] dark:text-[#4DC8A0]",
}

export default function SeniorsPage() {
  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">Care Members</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
          {MOCK_SENIORS.length} Care Members under active monitoring
        </p>
      </div>

      <div className="grid gap-4">
        {MOCK_SENIORS.map((senior) => {
          const cfg = statusConfig[senior.status]
          const activeAlertCount = senior.alerts.filter(
            (a) => a.status === "active"
          ).length
          return (
            <Link key={senior.id} href={`/seniors/${senior.id}`}>
              <Card className="border-border dark:border-gray-800 dark:bg-gray-900 hover:border-[#1D9E75]/40 transition-colors cursor-pointer">
                <CardContent className="p-5">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-4 min-w-0">
                      <div className={`w-12 h-12 rounded-full flex items-center justify-center shrink-0 text-base font-semibold ${avatarBg[senior.status]}`}>
                        {senior.name.split(" ").map((n) => n[0]).join("")}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h2 className="text-base font-semibold text-gray-900 dark:text-white">
                            {senior.name}
                          </h2>
                          <span className="text-sm text-gray-500 dark:text-gray-400">
                            Age {senior.age}
                          </span>
                          <Badge variant={cfg.badge}>{cfg.label}</Badge>
                          {activeAlertCount > 0 && (
                            <Badge variant="destructive" className="flex items-center gap-1">
                              <AlertTriangle className="h-3 w-3" />
                              {activeAlertCount} alert{activeAlertCount !== 1 ? "s" : ""}
                            </Badge>
                          )}
                        </div>
                        <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5 truncate">
                          {senior.primaryConditions.join(", ")}
                        </p>
                        <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                          {senior.location}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <div className="flex items-center gap-1 text-xs text-gray-400">
                        <Clock className="h-3 w-3" />
                        {formatRelativeTime(senior.lastSeen)}
                      </div>
                      <ChevronRight className="h-4 w-4 text-gray-400" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
