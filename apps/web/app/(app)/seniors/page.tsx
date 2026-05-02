"use client"

/**
 * `/seniors` — Care Members list, wired to the real backend.
 *
 * Data loads through `GET /api/data/care-recipients` instead of calling
 * `careRecipientService` from a Server Component. Reason: Cognito silent
 * refresh updates the sealed session cookie via `sessionService.
 * rotateSessionTokens`, and Next.js forbids cookie mutation during Server
 * Component render (`cookies can only be modified in a Server Action or
 * Route Handler`). The Route Handler runs `careRecipientService`, which
 * uses `apiClient` safely; the browser `fetch` applies `Set-Cookie` from
 * the refresh response.
 *
 * Thin list endpoint shape + Phase 4 placeholders — same semantics as the
 * prior server implementation.
 */

import { useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ChevronRight, Clock } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { formatRelativeTime } from "@/lib/utils"
import {
  careRecipientListRowToItem,
  type CareRecipientListInput,
  type CareRecipientListItem,
} from "@/lib/adapters/careRecipientToSenior"

const statusConfig = {
  routine: { label: "Routine", badge: "success" as const },
  monitor: { label: "Monitor", badge: "warning" as const },
  critical: { label: "Critical", badge: "destructive" as const },
}

const avatarBg: Record<string, string> = {
  critical: "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400",
  monitor:  "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400",
  routine:  "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400",
}

export default function SeniorsPage() {
  const router = useRouter()
  const [items, setItems] = useState<CareRecipientListItem[] | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const res = await fetch("/api/data/care-recipients", { cache: "no-store" })
        if (res.status === 401) {
          router.replace("/auth/sign-in")
          return
        }
        if (!res.ok) {
          if (!cancelled) setError(true)
          return
        }
        const data: { careRecipients?: CareRecipientListInput[] } = await res.json()
        const rows = data.careRecipients ?? []
        if (!cancelled) {
          setItems(rows.map((row) => careRecipientListRowToItem(row)))
        }
      } catch {
        if (!cancelled) setError(true)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [router])

  if (error) {
    return (
      <div className="max-w-4xl mx-auto space-y-6">
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">Care Members</h1>
        <Card className="border-border dark:border-gray-800 dark:bg-gray-900">
          <CardContent className="p-6 text-center">
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Unable to load Care Members. Please try again later.
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (items === null) {
    return (
      <div className="max-w-4xl mx-auto space-y-6">
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

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">Care Members</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
          {items.length} Care Member{items.length === 1 ? "" : "s"} In Your Care Circle
        </p>
      </div>

      {items.length === 0 ? (
        <Card className="border-border dark:border-gray-800 dark:bg-gray-900">
          <CardContent className="p-6 text-center">
            <p className="text-sm text-gray-500 dark:text-gray-400">
              No Care Members yet. Invite a family member or clinician to get started.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {items.map((item) => {
            const cfg = statusConfig[item.status]
            const initials = toInitials(item.name)
            return (
              <Link key={item.id} href={`/seniors/${item.id}`}>
                <Card className="border-border dark:border-gray-800 dark:bg-gray-900 hover:border-[#3B5BDB]/40 transition-colors cursor-pointer">
                  <CardContent className="p-5">
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex items-center gap-4 min-w-0">
                        <div className={`w-12 h-12 rounded-full flex items-center justify-center shrink-0 text-base font-semibold ${avatarBg[item.status]}`}>
                          {initials}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h2 className="text-base font-semibold text-gray-900 dark:text-white">
                              {item.name}
                            </h2>
                            {item.age !== null && (
                              <span className="text-sm text-gray-500 dark:text-gray-400">
                                Age {item.age}
                              </span>
                            )}
                            <Badge variant={cfg.badge}>{cfg.label}</Badge>
                          </div>
                          {item.primaryConditions.length > 0 ? (
                            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5 truncate">
                              {item.primaryConditions.join(", ")}
                            </p>
                          ) : (
                            <p className="text-sm text-gray-400 dark:text-gray-500 mt-0.5 italic">
                              No primary condition on file
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <div className="flex items-center gap-1 text-xs text-gray-400">
                          <Clock className="h-3 w-3" />
                          Updated {formatRelativeTime(item.updatedAt)}
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
      )}
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
