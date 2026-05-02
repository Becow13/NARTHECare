"use client"

/**
 * Below-header client shell for `/seniors/[id]`.
 *
 * The header card is owned by the server `page.tsx` because it
 * needs to fetch the full `CareRecipientProfile` with the
 * caregiver's Cognito ID token. Everything below the header is
 * either interactive (alert history expand/collapse, legend) or
 * scoped to data that does not exist in the backend yet (AI
 * summaries, vitals observations, alerts) — Phase 4 will swap the
 * empty states here for real readers.
 *
 * Deliberately decoupled from `lib/mock-data.ts`: Phase 3 ships a
 * real production path for this route, and pulling mocks into the
 * client bundle would trip `assertMocksAllowed()` in any deploy
 * that has not set `NEXT_PUBLIC_ALLOW_MOCKS=true`. When Phase 4
 * wires real vitals / summaries / alerts the props signature
 * upgrades; the rest of the file can stay.
 */

import Link from "next/link"
import { Sparkles, CheckCircle2, ChevronRight } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { DataFreshnessBadge } from "@/components/data-freshness-badge"
import { VitalsLegend } from "@/components/vitals-legend"
import { SeniorTabs } from "@/components/senior-tabs"

interface SeniorProfileClientProps {
  /** Care-recipient UUID — forwarded to Insights / Alerts deep links. */
  seniorId: string
  /** First token of the display name, used by the vitals legend copy. */
  firstName: string
}

export function SeniorProfileClient({
  seniorId,
  firstName,
}: SeniorProfileClientProps) {
  return (
    <>
      <VitalsLegend seniorFirstName={firstName} />

      <Card className="border-border dark:border-gray-800 dark:bg-gray-900">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-[#3B5BDB]" />
            <CardTitle className="text-sm font-semibold">
              Latest AI Summary
            </CardTitle>
          </div>
        </CardHeader>
        <CardContent className="px-5 pb-5">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            No AI summary yet. Summaries will appear here once daily health
            signals are available.
          </p>
          <div className="mt-4">
            <Link href={`/insights?seniorId=${seniorId}`}>
              <Button size="sm" variant="outline" className="w-full text-xs h-8">
                Open Insights
                <ChevronRight className="h-3.5 w-3.5 ml-1" />
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>

      <div>
        <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
          <h2 className="text-base font-semibold text-gray-900 dark:text-white">
            Vitals — Last 7 Days
          </h2>
          <DataFreshnessBadge isLive={false} />
        </div>
        <Card className="border-border dark:border-gray-800 dark:bg-gray-900">
          <CardContent className="p-6 text-center">
            <p className="text-sm text-gray-500 dark:text-gray-400">
              No vitals on record yet. Connect Apple Health or another data
              source on the member detail to start seeing readings here.
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-900 dark:text-white">
            Alert History
          </h2>
          <Link
            href={`/alerts?seniorId=${seniorId}`}
            className="text-sm text-[#3B5BDB] hover:text-[#2F4AC4] font-medium flex items-center gap-1"
          >
            View all alerts <ChevronRight className="h-3.5 w-3.5" />
          </Link>
        </div>
        <Card className="border-border dark:border-gray-800 dark:bg-gray-900">
          <CardContent className="p-6 text-center">
            <CheckCircle2 className="h-8 w-8 text-emerald-400 mx-auto mb-2" />
            <p className="text-sm text-gray-500 dark:text-gray-400">
              No alerts on record
            </p>
          </CardContent>
        </Card>
      </div>

      <SeniorTabs seniorId={seniorId} />
    </>
  )
}
