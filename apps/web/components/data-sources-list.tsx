"use client"

import { useState } from "react"
import type { DataSource } from "@/lib/mock-data"
import { formatRelativeTime } from "@/lib/utils"

const INITIAL_VISIBLE = 4

interface DataSourcesListProps {
  sources: DataSource[]
}

export function DataSourcesList({ sources }: DataSourcesListProps) {
  const [showAll, setShowAll] = useState(false)

  const hasMore = sources.length > INITIAL_VISIBLE
  const visible = showAll ? sources : sources.slice(0, INITIAL_VISIBLE)

  return (
    <div className="space-y-2">
      {visible.map((source) => (
        <div key={source.id} className="flex items-center gap-2 min-w-0">
          <span
            className={`w-2 h-2 rounded-full shrink-0 ${
              source.connected ? "bg-emerald-500" : "bg-red-500"
            }`}
          />
          <div className="min-w-0 flex-1">
            <p className="text-xs text-gray-800 dark:text-gray-200 truncate leading-snug">
              {source.name}
            </p>
            <p className="text-[10px] text-gray-400 dark:text-gray-500 leading-snug">
              {source.connected
                ? `synced ${formatRelativeTime(source.lastSync)}`
                : `offline ${formatRelativeTime(source.lastSync)}`}
            </p>
          </div>
        </div>
      ))}
      {hasMore && (
        <button
          onClick={() => setShowAll((v) => !v)}
          className="text-[10px] font-medium text-[#1D9E75] hover:text-[#187E5D] dark:hover:text-[#4DC8A0] transition-colors"
        >
          {showAll
            ? "show less"
            : `show all ${sources.length}`}
        </button>
      )}
    </div>
  )
}

