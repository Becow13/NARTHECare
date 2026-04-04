"use client"

import { useState } from "react"
import { CalendarClock, MapPin } from "lucide-react"
import Link from "next/link"
import { MOCK_APPOINTMENTS, MOCK_SENIORS } from "@/lib/mock-data"

function getDaysUntil(dateStr: string) {
  const now = new Date()
  const appt = new Date(dateStr)
  const diff = Math.ceil((appt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
  return diff
}

function formatDate(dateStr: string) {
  const d = new Date(dateStr)
  return d.toLocaleDateString("en-US", {
    weekday: "long", month: "long", day: "numeric",
  }) + " at " + d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
}

function DaysUntilBadge({ days }: { days: number }) {
  if (days <= 0) return <span className="text-xs font-medium px-2 py-1 rounded-full bg-red-100 text-red-700">Today</span>
  if (days === 1) return <span className="text-xs font-medium px-2 py-1 rounded-full bg-red-100 text-red-700">Tomorrow</span>
  if (days <= 7) return <span className="text-xs font-medium px-2 py-1 rounded-full bg-amber-100 text-amber-700">{days} days</span>
  return <span className="text-xs font-medium px-2 py-1 rounded-full bg-gray-100 text-gray-600">{days} days</span>
}

function borderColor(days: number) {
  if (days <= 2) return "border-l-red-400"
  if (days <= 7) return "border-l-amber-400"
  return "border-l-gray-300"
}

function avatarColor(status: string) {
  if (status === "critical") return "bg-red-100 text-red-700"
  if (status === "monitor") return "bg-amber-100 text-amber-700"
  return "bg-green-100 text-green-700"
}

function initials(name: string) {
  return name.split(" ").map(n => n[0]).join("")
}

export default function AppointmentsPage() {
  const [seniorFilter, setSeniorFilter] = useState("all")
  const [urgencyFilter, setUrgencyFilter] = useState("all")

  const filtered = MOCK_APPOINTMENTS
    .filter(appt => seniorFilter === "all" || appt.seniorId === seniorFilter)
    .filter(appt => {
      const days = getDaysUntil(appt.date)
      if (urgencyFilter === "week") return days <= 7
      if (urgencyFilter === "month") return days <= 30
      if (urgencyFilter === "later") return days > 30
      return true
    })
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())

  return (
    <div className="p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Appointments</h1>
        <p className="text-sm text-gray-500 mt-1">All upcoming appointments across your care members</p>
      </div>

      {/* Filters */}
      <div className="flex gap-3 mb-6 flex-wrap">
        <select
          value={seniorFilter}
          onChange={e => setSeniorFilter(e.target.value)}
          className="text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-green-200"
        >
          <option value="all">All Care Members</option>
          {MOCK_SENIORS.map(s => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>

        <select
          value={urgencyFilter}
          onChange={e => setUrgencyFilter(e.target.value)}
          className="text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-green-200"
        >
          <option value="all">All Dates</option>
          <option value="week">This Week</option>
          <option value="month">This Month</option>
          <option value="later">Later</option>
        </select>
      </div>

      {/* Cards */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-gray-400">
          <CalendarClock className="h-10 w-10 mb-3" />
          <p className="text-sm">No appointments match your filters</p>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {filtered.map(appt => {
            const senior = MOCK_SENIORS.find(s => s.id === appt.seniorId)
            if (!senior) return null
            const days = getDaysUntil(appt.date)
            return (
              <div
                key={appt.id}
                className={`bg-white rounded-xl border border-gray-100 border-l-4 ${borderColor(days)} shadow-sm p-5`}
              >
                {/* Top row */}
                <div className="flex items-start justify-between gap-4 mb-3">
                  <div className="flex items-center gap-3">
                    <div className={`h-9 w-9 rounded-full flex items-center justify-center text-sm font-semibold ${avatarColor(senior.status)}`}>
                      {initials(senior.name)}
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-gray-900">{senior.name}</p>
                      <p className="text-xs text-gray-400">{(senior.conditions ?? []).join(", ")}</p>
                    </div>
                  </div>
                  <DaysUntilBadge days={days} />
                </div>

                {/* Appointment details */}
                <p className="font-semibold text-gray-900 mb-1">{appt.title}</p>
                <p className="text-sm text-gray-500 mb-1">{appt.provider}</p>
                <p className="text-sm text-gray-500 mb-1">{formatDate(appt.date)}</p>
                {appt.location && (
                  <div className="flex items-center gap-1 text-sm text-gray-400 mb-3">
                    <MapPin className="h-3.5 w-3.5" />
                    {appt.location}
                  </div>
                )}

                {/* Notes */}
                {appt.notes && (
                  <div className="mt-3 pt-3 border-t border-gray-100">
                    <p className="text-xs font-medium text-gray-500 mb-1">Caregiver Notes</p>
                    <p className="text-sm text-gray-500 italic">{appt.notes}</p>
                  </div>
                )}

                {/* Button */}
                <div className="mt-4">
                  <Link href={`/seniors/${senior.id}`}>
                    <button className="bg-[#3B5BDB] hover:bg-[#2F4AC4] text-white text-sm px-4 py-2 rounded-lg font-medium">
                      View Care Member Profile
                    </button>
                  </Link>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
