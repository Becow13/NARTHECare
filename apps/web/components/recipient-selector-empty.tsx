"use client"

/**
 * Shared "select a care member" empty state for surfaces whose data
 * is per-recipient (alerts, appointments, AI insights, action plans).
 *
 * Loads the caller's real care recipients via `/api/data/care-recipients`
 * — never falls back to mock data. When a recipient is selected, the
 * caller follows the link into `/seniors/[id]`, where the per-recipient
 * dashboard fetches the relevant feed from the backend.
 *
 * Renders three honest states:
 *   1. loading — skeleton
 *   2. empty   — "No Care Members yet" with a link to `/seniors`
 *   3. ready   — list of care members the caller can drill into
 *
 * No PHI is logged. The `Senior` shape is built via the existing
 * adapter so the caller renders the same view model they used to
 * read from `MOCK_SENIORS` (status, age, conditions).
 */

import { useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Card, CardContent } from "./ui/card"
import { ChevronRight } from "lucide-react"
import {
  careRecipientListRowToItem,
  type CareRecipientListInput,
  type CareRecipientListItem,
} from "@/lib/adapters/careRecipientToSenior"

interface Props {
  /** What this surface is asking the caregiver to pick a member for. */
  feature: "alerts" | "appointments" | "insights" | "action-plans"
}

const FEATURE_COPY: Record<
  Props["feature"],
  { title: string; pickPrompt: string; cta: string }
> = {
  alerts: {
    title: "Alerts",
    pickPrompt: "Select a Care Member to view their alerts.",
    cta: "Open alerts",
  },
  appointments: {
    title: "Appointments",
    pickPrompt: "Select a Care Member to view their appointments.",
    cta: "Open appointments",
  },
  insights: {
    title: "AI Insights",
    pickPrompt: "Select a Care Member to view AI summaries.",
    cta: "Open AI insights",
  },
  "action-plans": {
    title: "Action Plans",
    pickPrompt: "Select a Care Member to view action plans.",
    cta: "Open action plans",
  },
}

const FEATURE_TAB: Record<Props["feature"], string> = {
  alerts: "alerts",
  appointments: "appointments",
  insights: "summaries",
  "action-plans": "action-plans",
}

export function RecipientSelectorEmpty({ feature }: Props) {
  const router = useRouter()
  const [items, setItems] = useState<CareRecipientListItem[] | null>(null)
  const [error, setError] = useState(false)

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
          if (!cancelled) setError(true)
          return
        }
        const data: { careRecipients?: CareRecipientListInput[] } =
          await res.json()
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

  const copy = FEATURE_COPY[feature]
  const tabKey = FEATURE_TAB[feature]

  if (error) {
    return (
      <div className="max-w-3xl mx-auto space-y-6">
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">
          {copy.title}
        </h1>
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
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="h-8 w-48 rounded bg-gray-200 dark:bg-gray-800 animate-pulse" />
        <div className="h-32 rounded-lg bg-gray-100 dark:bg-gray-900 animate-pulse border border-border dark:border-gray-800" />
      </div>
    )
  }

  if (items.length === 0) {
    return (
      <div className="max-w-3xl mx-auto space-y-6">
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">
          {copy.title}
        </h1>
        <Card className="border-border dark:border-gray-800 dark:bg-gray-900">
          <CardContent className="p-8 text-center space-y-3">
            <p className="text-sm text-gray-500 dark:text-gray-400">
              No Care Members yet. Add one to start tracking{" "}
              {copy.title.toLowerCase()}.
            </p>
            <Link
              href="/seniors"
              className="inline-flex items-center gap-1 text-sm text-[#3B5BDB] hover:text-[#2F4AC4] font-medium"
            >
              Manage Care Members <ChevronRight className="h-3.5 w-3.5" />
            </Link>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">
          {copy.title}
        </h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
          {copy.pickPrompt}
        </p>
      </div>
      <div className="grid gap-3">
        {items.map((item) => {
          const initials = _toInitials(item.name)
          return (
            <Link key={item.id} href={`/seniors/${item.id}?tab=${tabKey}`}>
              <Card className="border-border dark:border-gray-800 dark:bg-gray-900 hover:border-[#3B5BDB]/40 transition-colors cursor-pointer">
                <CardContent className="p-4 flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-[#3B5BDB]/10 text-[#3B5BDB] flex items-center justify-center text-sm font-semibold shrink-0">
                    {initials}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                      {item.name}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                      {copy.cta}
                    </p>
                  </div>
                  <ChevronRight className="h-4 w-4 text-gray-400 shrink-0" />
                </CardContent>
              </Card>
            </Link>
          )
        })}
      </div>
    </div>
  )
}

function _toInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return "?"
  return parts
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join("")
}
