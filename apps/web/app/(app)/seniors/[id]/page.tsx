"use client"

/**
 * `/seniors/[id]` — Care Member detail; header rail loads via
 * `GET /api/data/care-recipients/:id/profile`.
 *
 * Same Route Handler + browser `fetch` pattern as `../page.tsx`: silent
 * Cognito refresh mutates cookies only inside Route Handlers / Server
 * Actions, not during Server Component rendering.
 */

import { useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ArrowLeft, AlertTriangle, Clock, Phone } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { CareTeamList } from "@/components/care-team-list"
import { DataSourcesList } from "@/components/data-sources-list"
import { formatRelativeTime } from "@/lib/utils"
import {
  careRecipientProfileToHeader,
  type CareRecipientHeaderViewModel,
} from "@/lib/adapters/careRecipientToSenior"
import type { CareRecipientProfile } from "@models/CareRecipientProfile"
import { SeniorProfileClient } from "./senior-profile-client"

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

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

type LoadState =
  | { kind: "loading" }
  | { kind: "ready"; header: CareRecipientHeaderViewModel }
  | { kind: "not-found" }
  | { kind: "error" }

export default function SeniorProfilePage({ params }: { params: { id: string } }) {
  const router = useRouter()
  const [state, setState] = useState<LoadState>(() =>
    UUID_PATTERN.test(params.id) ? { kind: "loading" } : { kind: "not-found" },
  )

  useEffect(() => {
    if (!UUID_PATTERN.test(params.id)) {
      return
    }

    let cancelled = false
    async function load() {
      setState({ kind: "loading" })
      try {
        const res = await fetch(
          `/api/data/care-recipients/${encodeURIComponent(params.id)}/profile`,
          { cache: "no-store" },
        )
        if (res.status === 401) {
          router.replace("/auth/sign-in")
          return
        }
        if (res.status === 404) {
          if (!cancelled) setState({ kind: "not-found" })
          return
        }
        if (!res.ok) {
          if (!cancelled) setState({ kind: "error" })
          return
        }
        const data: { careRecipient?: CareRecipientProfile } = await res.json()
        const profile = data.careRecipient
        if (!profile) {
          if (!cancelled) setState({ kind: "error" })
          return
        }
        const header = careRecipientProfileToHeader(profile)
        if (!cancelled) setState({ kind: "ready", header })
      } catch {
        if (!cancelled) setState({ kind: "error" })
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [params.id, router])

  if (state.kind === "not-found") {
    return (
      <div className="max-w-5xl mx-auto space-y-6">
        <Link
          href="/seniors"
          className="inline-flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Care Members
        </Link>
        <Card className="border-border dark:border-gray-800 dark:bg-gray-900">
          <CardContent className="p-8 text-center">
            <p className="text-sm text-gray-500 dark:text-gray-400">
              This Care Member could not be found or you do not have access.
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (state.kind === "error") {
    return (
      <div className="max-w-5xl mx-auto space-y-6">
        <Link
          href="/seniors"
          className="inline-flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Care Members
        </Link>
        <Card className="border-border dark:border-gray-800 dark:bg-gray-900">
          <CardContent className="p-8 text-center">
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Unable to load this profile. Please try again later.
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (state.kind !== "ready") {
    return (
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="h-5 w-40 rounded bg-gray-200 dark:bg-gray-800 animate-pulse" />
        <Card className="border-border dark:border-gray-800 dark:bg-gray-900">
          <CardContent className="p-6">
            <div className="flex gap-5 animate-pulse">
              <div className="w-20 h-20 rounded-2xl bg-gray-200 dark:bg-gray-800 shrink-0" />
              <div className="flex-1 space-y-3">
                <div className="h-8 w-56 rounded bg-gray-200 dark:bg-gray-800" />
                <div className="h-4 w-40 rounded bg-gray-100 dark:bg-gray-900" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  const header = state.header
  const cfg = statusConfig[header.status]
  const initials = toInitials(header.name)
  const firstName = header.name.split(" ")[0] || header.name

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <Link
        href="/seniors"
        className="inline-flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Care Members
      </Link>

      <Card className="border-border dark:border-gray-800 dark:bg-gray-900">
        <CardContent className="p-6">
          <div className="flex flex-col lg:flex-row gap-0">

            <div className="flex flex-col sm:flex-row sm:items-start gap-5 flex-[2] min-w-0 lg:pr-6">
              <div className={`w-20 h-20 rounded-2xl flex items-center justify-center shrink-0 text-2xl font-bold ${avatarBg[header.status]}`}>
                {initials}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-start gap-3">
                  <div>
                    <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                      {header.name}
                    </h1>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                      Age {header.age}
                      {header.location ? ` · ${header.location}` : ""}
                    </p>
                  </div>
                  <span
                    className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium ${cfg.bg} ${cfg.color}`}
                  >
                    <span className={`w-2 h-2 rounded-full ${cfg.dot}`} />
                    {cfg.label}
                  </span>
                </div>

                {header.primaryConditions.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-3">
                    {header.primaryConditions.map((cond) => (
                      <span
                        key={cond}
                        className="text-xs px-2.5 py-1 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 font-medium"
                      >
                        {cond}
                      </span>
                    ))}
                  </div>
                )}

                <div className="flex items-center gap-1.5 mt-3 text-xs text-gray-500 dark:text-gray-400">
                  <Clock className="h-3.5 w-3.5" />
                  Last updated {formatRelativeTime(header.lastSeen)}
                </div>

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

            <div className="hidden lg:block w-px bg-gray-200 dark:bg-gray-700 mx-0 my-1 self-stretch" />
            <div className="block lg:hidden h-px bg-gray-200 dark:bg-gray-700 my-5" />

            <div className="flex-1 min-w-0 lg:px-6">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-3">
                Care Team
              </p>
              {header.careTeam.length > 0 ? (
                <CareTeamList members={header.careTeam} />
              ) : (
                <p className="text-xs text-gray-400 dark:text-gray-500">
                  No care team members on file
                </p>
              )}
            </div>

            <div className="hidden lg:block w-px bg-gray-200 dark:bg-gray-700 mx-0 my-1 self-stretch" />
            <div className="block lg:hidden h-px bg-gray-200 dark:bg-gray-700 my-5" />

            <div className="flex-1 min-w-0 lg:pl-6">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-3">
                Connected Sources
              </p>
              {header.dataSources.length > 0 ? (
                <DataSourcesList sources={header.dataSources} />
              ) : (
                <p className="text-xs text-gray-400 dark:text-gray-500">
                  No data sources connected yet
                </p>
              )}
            </div>

          </div>
        </CardContent>
      </Card>

      <SeniorProfileClient seniorId={header.id} firstName={firstName} />
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
