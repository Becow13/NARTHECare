"use client"

/**
 * `/dashboard` — Care Hub overview, wired to the real backend.
 *
 * Pulls the real care-recipients list via `/api/data/care-recipients`
 * and renders a snapshot row per recipient. Per-row vitals, alert
 * counts, and AI summaries are intentionally NOT fetched in a fan-out
 * here — that would be N+1 PHI traffic on every dashboard load. The
 * row links into `/seniors/[id]`, which calls
 * `/api/data/care-recipients/[id]/dashboard` for the composite
 * read on demand.
 *
 * Loading / empty / error are first-class states — there is no mock
 * fallback. When the caller has no recipients, the page shows a clear
 * "No Care Members yet" CTA.
 */

import { useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  Users,
  ChevronRight,
  Clock,
  CheckCircle2,
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { formatRelativeTime } from "@/lib/utils"
import {
  careRecipientListRowToItem,
  type CareRecipientListInput,
  type CareRecipientListItem,
} from "@/lib/adapters/careRecipientToSenior"

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
} as const

const avatarBg: Record<string, string> = {
  critical: "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400",
  monitor: "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400",
  routine: "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400",
}

const GRID =
  "grid grid-cols-[12px_36px_minmax(150px,40%)_minmax(80px,15%)_minmax(110px,20%)_1fr] gap-x-3 items-center"

export default function CareHubPage() {
  const router = useRouter()
  const [items, setItems] = useState<CareRecipientListItem[] | null>(null)
  const [loadError, setLoadError] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const res = await fetch("/api/data/care-recipients", {
          cache: "no-store",
        })
        if (res.status === 401) {
          router.replace("/auth/sign-in")
          return
        }
        if (!res.ok) {
          if (!cancelled) setLoadError(true)
          return
        }
        const data: { careRecipients?: CareRecipientListInput[] } =
          await res.json()
        const rows = data.careRecipients ?? []
        if (!cancelled) {
          setItems(rows.map((row) => careRecipientListRowToItem(row)))
        }
      } catch {
        if (!cancelled) setLoadError(true)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [router])

  if (loadError) {
    return (
      <div className="w-full max-w-7xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">
            Care Hub
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            Welcome back to your care circle.
          </p>
        </div>
        <Card className="border-border dark:border-gray-800 dark:bg-gray-900">
          <CardContent className="p-6 text-center">
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Unable to load Care Hub. Please try again later.
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (items === null) {
    return (
      <div className="w-full max-w-7xl mx-auto space-y-6">
        <div className="h-8 w-48 rounded bg-gray-200 dark:bg-gray-800 animate-pulse" />
        <div className="h-4 w-72 rounded bg-gray-100 dark:bg-gray-900 animate-pulse" />
        <div className="grid gap-4">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-24 rounded-lg bg-gray-100 dark:bg-gray-900 animate-pulse border border-border dark:border-gray-800"
            />
          ))}
        </div>
      </div>
    )
  }

  const activeCount = items.length

  return (
    <div className="w-full max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">
          Care Hub
        </h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
          Welcome back to your care circle.
        </p>
      </div>

      {/* Stat cards — counts only. PHI-free aggregates are safe to render
          on the overview; per-recipient signals live one click away on
          `/seniors/[id]` (which fetches the composite dashboard). */}
      <div className="flex justify-center gap-4">
        <Card className="border-border dark:border-gray-800 dark:bg-gray-900 w-56">
          <CardContent className="p-4">
            <div className="flex items-center justify-between gap-6">
              <div>
                <p className="text-[10px] font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                  Active Care Members
                </p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white mt-0.5">
                  {activeCount}
                </p>
              </div>
              <div className="w-9 h-9 rounded-lg bg-[#EEF0FF] dark:bg-[#3B5BDB]/20 flex items-center justify-center shrink-0">
                <Users className="h-4 w-4 text-[#3B5BDB]" />
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
          {items.length === 0 ? (
            <div className="py-8 text-center space-y-3">
              <CheckCircle2 className="h-8 w-8 text-gray-300 dark:text-gray-700 mx-auto" />
              <p className="text-sm text-gray-500 dark:text-gray-400">
                No Care Members yet. Invite a family member or clinician to get
                started.
              </p>
              <Link
                href="/seniors"
                className="inline-flex items-center gap-1 text-sm text-[#3B5BDB] hover:text-[#2F4AC4] font-medium"
              >
                Manage Care Members <ChevronRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          ) : (
            <>
              <div
                className={`${GRID} pb-2 border-b border-gray-100 dark:border-gray-800 text-[10px] font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wide`}
              >
                <span />
                <span />
                <span>Care Member</span>
                <span className="text-center">Status</span>
                <span className="text-center">Last Updated</span>
                <span className="text-center">Conditions</span>
              </div>

              {items.map((item) => {
                const cfg = statusConfig[item.status]
                const initials = toInitials(item.name)
                const rowHref = `/seniors/${item.id}`
                return (
                  <div
                    key={item.id}
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
                    <span
                      className={`w-2.5 h-2.5 rounded-full shrink-0 ${cfg.dot}`}
                    />
                    <div
                      className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-semibold shrink-0 ${avatarBg[item.status]}`}
                    >
                      {initials}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                        {item.name}
                      </p>
                      {item.age !== null ? (
                        <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                          Age {item.age}
                        </p>
                      ) : null}
                    </div>
                    <div className="flex justify-center">
                      <span
                        className={`text-xs font-medium px-2 py-0.5 rounded-full ${cfg.bg} ${cfg.color}`}
                      >
                        {cfg.label}
                      </span>
                    </div>
                    <div className="flex items-center justify-center gap-1 text-xs text-gray-400 dark:text-gray-500">
                      <Clock className="h-3 w-3 shrink-0" />
                      <span className="truncate">
                        {formatRelativeTime(item.updatedAt)}
                      </span>
                    </div>
                    <div className="text-center">
                      {item.primaryConditions.length > 0 ? (
                        <p className="text-xs text-gray-600 dark:text-gray-300 truncate">
                          {item.primaryConditions.join(", ")}
                        </p>
                      ) : (
                        <p className="text-xs text-gray-400 dark:text-gray-500 italic">
                          No primary condition on file
                        </p>
                      )}
                    </div>
                  </div>
                )
              })}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function toInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return "?"
  return parts
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join("")
}
