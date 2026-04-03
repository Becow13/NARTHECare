"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  LayoutDashboard,
  Users,
  AlertTriangle,
  Sparkles,
  ClipboardList,
  Settings,
  Heart,
  Menu,
  X,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { useState } from "react"

const navItems = [
  {
    label: "Dashboard",
    href: "/dashboard",
    icon: LayoutDashboard,
  },
  {
    label: "Care Members",
    href: "/seniors",
    icon: Users,
  },
  {
    label: "Alerts",
    href: "/alerts",
    icon: AlertTriangle,
  },
  {
    label: "AI Insights",
    href: "/insights",
    icon: Sparkles,
  },
  {
    label: "Action Plans",
    href: "/action-plans",
    icon: ClipboardList,
  },
  {
    label: "Settings",
    href: "/settings",
    icon: Settings,
  },
]

export function Sidebar() {
  const pathname = usePathname()
  const [mobileOpen, setMobileOpen] = useState(false)

  return (
    <>
      {/* Mobile toggle */}
      <button
        className="fixed top-4 left-4 z-50 lg:hidden p-2 rounded-md bg-white dark:bg-gray-900 border border-border shadow-sm"
        onClick={() => setMobileOpen(!mobileOpen)}
        aria-label="Toggle menu"
      >
        {mobileOpen ? (
          <X className="h-5 w-5 text-gray-600 dark:text-gray-300" />
        ) : (
          <Menu className="h-5 w-5 text-gray-600 dark:text-gray-300" />
        )}
      </button>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/40 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar panel */}
      <aside
        className={cn(
          "fixed top-0 left-0 z-40 h-full w-60 flex flex-col bg-white dark:bg-gray-950 border-r border-border transition-transform duration-200 ease-in-out",
          mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        )}
      >
        {/* Wordmark */}
        <div className="flex items-center gap-2.5 px-6 py-5 border-b border-border">
          <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-[#1D9E75]">
            <Heart className="w-4 h-4 text-white fill-white" />
          </div>
          <span className="text-[15px] font-semibold tracking-tight text-gray-900 dark:text-white">
            NartheCare
          </span>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 space-y-0.5">
          {navItems.map((item) => {
            const Icon = item.icon
            const isActive =
              pathname === item.href || pathname.startsWith(item.href + "/")
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMobileOpen(false)}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                  isActive
                    ? "bg-[#E8F7F2] text-[#1D9E75] dark:bg-[#1D9E75]/20 dark:text-[#4DC8A0]"
                    : "text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-gray-100"
                )}
              >
                <Icon
                  className={cn(
                    "h-4 w-4 shrink-0",
                    isActive
                      ? "text-[#1D9E75] dark:text-[#4DC8A0]"
                      : "text-gray-500 dark:text-gray-500"
                  )}
                />
                {item.label}
              </Link>
            )
          })}
        </nav>

        {/* Footer */}
        <div className="px-4 py-4 border-t border-border">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-[#1D9E75]/10 flex items-center justify-center shrink-0">
              <span className="text-xs font-semibold text-[#1D9E75]">BY</span>
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                Becca Yang
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                Family Caregiver
              </p>
            </div>
          </div>
        </div>
      </aside>
    </>
  )
}

