"use client"

import Link from "next/link"
import { ClipboardList, CalendarClock } from "lucide-react"
import { Button } from "@/components/ui/button"

interface SeniorTabsProps {
  seniorId: string
}

export function SeniorTabs({ seniorId }: SeniorTabsProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-10">
      <Link href={`/action-plans?seniorId=${seniorId}`}>
        <Button className="bg-[#1D9E75] hover:bg-[#187E5D] text-white flex items-center gap-2 w-64 justify-center">
          <ClipboardList className="h-4 w-4" />
          View Action Plans
        </Button>
      </Link>
      <Link href={`/appointments?seniorId=${seniorId}`}>
        <Button className="bg-[#1D9E75] hover:bg-[#187E5D] text-white flex items-center gap-2 w-64 justify-center">
          <CalendarClock className="h-4 w-4" />
          View Upcoming Appointments
        </Button>
      </Link>
    </div>
  )
}
