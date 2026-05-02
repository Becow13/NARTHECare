"use client"

import { useState } from "react"
import { ChevronDown, ChevronUp } from "lucide-react"
import { Badge } from "@/components/ui/badge"

interface VitalsLegendProps {
  seniorFirstName: string
}

export function VitalsLegend({ seniorFirstName }: VitalsLegendProps) {
  const [open, setOpen] = useState(false)

  return (
    <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 overflow-hidden">
      {/* Toggle row */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-end gap-1.5 px-4 py-2 text-xs text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
        aria-expanded={open}
        aria-label="Toggle legend"
      >
        <span className="font-medium">How to read this page</span>
        {open
          ? <ChevronUp className="h-3.5 w-3.5 shrink-0" />
          : <ChevronDown className="h-3.5 w-3.5 shrink-0" />
        }
      </button>

      {/* Content */}
      {open && (
        <div className="flex flex-col sm:flex-row gap-0 border-t border-gray-200 dark:border-gray-700">
          {/* LEFT — Vitals indicators */}
          <div className="flex-1 px-4 py-3 space-y-2">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
              Vitals Indicators
            </p>
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
                <span className="text-xs text-gray-600 dark:text-gray-300">
                  Within normal range for {seniorFirstName}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-amber-500 shrink-0" />
                <span className="text-xs text-gray-600 dark:text-gray-300">
                  Slightly outside normal range — monitor
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-red-500 shrink-0" />
                <span className="text-xs text-gray-600 dark:text-gray-300">
                  Outside normal range — attention needed
                </span>
              </div>
            </div>
          </div>

          {/* Divider */}
          <div className="hidden sm:block w-px bg-gray-200 dark:bg-gray-700 my-3" />
          <div className="block sm:hidden h-px bg-gray-200 dark:bg-gray-700 mx-4" />

          {/* RIGHT — Alert levels */}
          <div className="flex-1 px-4 py-3 space-y-2">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
              Alert Levels
            </p>
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <Badge variant="destructive" className="text-[10px] px-1.5 py-0 shrink-0">
                  Critical
                </Badge>
                <span className="text-xs text-gray-600 dark:text-gray-300">
                  Act today — cannot wait
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="warning" className="text-[10px] px-1.5 py-0 shrink-0">
                  Moderate
                </Badge>
                <span className="text-xs text-gray-600 dark:text-gray-300">
                  Check in within 48 hours
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="muted" className="text-[10px] px-1.5 py-0 shrink-0">
                  Low
                </Badge>
                <span className="text-xs text-gray-600 dark:text-gray-300">
                  Informational — no action needed
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

