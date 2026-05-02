import { cn } from "@/lib/utils"

interface DataFreshnessBadgeProps {
  isLive?: boolean
  className?: string
}

export function DataFreshnessBadge({
  isLive = false,
  className,
}: DataFreshnessBadgeProps) {
  if (isLive) {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-[#E8F7F2] text-[#1D9E75] dark:bg-[#1D9E75]/20 dark:text-[#4DC8A0]",
          className
        )}
      >
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#1D9E75] opacity-75" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-[#1D9E75]" />
        </span>
        Live
      </span>
    )
  }

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400",
        className
      )}
    >
      <span className="h-2 w-2 rounded-full bg-gray-400 dark:bg-gray-500" />
      7-day avg
    </span>
  )
}

