"use client"

import Link from "next/link"
import { ClipboardList } from "lucide-react"
import { Button } from "@/components/ui/button"

interface SeniorTabsProps {
  seniorId: string
}

export function SeniorTabs({ seniorId }: SeniorTabsProps) {
  return (
    <div className="flex items-center justify-center py-10">
      <Link href={`/action-plans?seniorId=${seniorId}`}>
        <Button className="bg-[#1D9E75] hover:bg-[#187E5D] text-white flex items-center gap-2">
          <ClipboardList className="h-4 w-4" />
          View Action Plans
        </Button>
      </Link>
    </div>
  )
}
