"use client"

import { useState } from "react"
import { Phone } from "lucide-react"
import type { CareTeamMember } from "@/lib/mock-data"

const VISIBLE_COUNT = 3

interface CareTeamListProps {
  members: CareTeamMember[]
}

export function CareTeamList({ members }: CareTeamListProps) {
  const [showAll, setShowAll] = useState(false)
  const visible = showAll ? members : members.slice(0, VISIBLE_COUNT)
  const hasMore = members.length > VISIBLE_COUNT

  return (
    <div className="space-y-3">
      {visible.map((member) => (
        <div key={member.id} className="space-y-0.5">
          <p className="text-xs font-semibold text-gray-800 dark:text-gray-200 leading-snug">
            {member.name}
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {member.role}
          </p>
          <a
            href={`tel:${member.phone}`}
            className="flex items-center gap-1 text-xs text-gray-400 dark:text-gray-500 hover:text-[#1D9E75]"
          >
            <Phone className="h-2.5 w-2.5" />
            {member.phone}
          </a>
        </div>
      ))}
      {hasMore && (
        <button
          onClick={() => setShowAll((prev) => !prev)}
          className="text-xs text-[#1D9E75] hover:text-[#187E5D] font-medium"
        >
          {showAll ? "show less" : `show all ${members.length}`}
        </button>
      )}
    </div>
  )
}

