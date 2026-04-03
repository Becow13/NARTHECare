"use client"

import Link from "next/link"
import { ClipboardList } from "lucide-react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Button } from "@/components/ui/button"

interface SeniorTabsProps {
  seniorId: string
}

export function SeniorTabs({ seniorId }: SeniorTabsProps) {
  return (
    <Tabs defaultValue="action-plans">
      <TabsList className="mb-4">
        <TabsTrigger value="action-plans" className="flex items-center gap-1.5 text-sm">
          <ClipboardList className="h-3.5 w-3.5" />
          Action Plans
        </TabsTrigger>
      </TabsList>

      <TabsContent value="action-plans">
        <div className="flex items-center justify-center py-10">
          <Link href={`/action-plans?seniorId=${seniorId}`}>
            <Button className="bg-[#1D9E75] hover:bg-[#187E5D] text-white">
              View Action Plans
            </Button>
          </Link>
        </div>
      </TabsContent>
    </Tabs>
  )
}
