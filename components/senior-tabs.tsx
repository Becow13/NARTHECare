"use client"

import { useState, useEffect } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import {
  Sparkles,
  ClipboardList,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  Circle,
  Share2,
  X,
  Loader2,
  DollarSign,
  BookOpen,
  ExternalLink,
  Phone,
} from "lucide-react"
import {
  MOCK_ALERTS,
  MOCK_ACTION_PLANS,
  type Alert,
  type ActionPlan,
  type ActionOption,
} from "@/lib/mock-data"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { formatRelativeTime } from "@/lib/utils"

// ─── helpers ─────────────────────────────────────────────────────────────────

const difficultyConfig = {
  easy: { label: "Easy", color: "text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40" },
  moderate: { label: "Moderate", color: "text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40" },
  involved: { label: "Involved", color: "text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/40" },
}

const levelConfig = {
  standard: { label: "Standard", ring: "border-gray-200 dark:border-gray-700", accent: "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300" },
  better: { label: "Better", ring: "border-[#1D9E75]/40 dark:border-[#1D9E75]/30", accent: "bg-[#E8F7F2] dark:bg-[#1D9E75]/10 text-[#1D9E75] dark:text-[#4DC8A0]" },
  best: { label: "Best", ring: "border-violet-300 dark:border-violet-700/50", accent: "bg-violet-50 dark:bg-violet-950/30 text-violet-700 dark:text-violet-400" },
}

const resourceTypeIcon = {
  professional: Phone,
  device: BookOpen,
  service: BookOpen,
  insurance: DollarSign,
  community: BookOpen,
}

// ─── Generate Plan Modal ─────────────────────────────────────────────────────

interface GenerateModalProps {
  seniorId: string
  alerts: Alert[]
  onGenerate: (plan: ActionPlan) => void
  onClose: () => void
  preCheckedAlertId?: string | null
}

function GenerateModal({ seniorId, alerts, onGenerate, onClose, preCheckedAlertId }: GenerateModalProps) {
  const [checkedIds, setCheckedIds] = useState<Set<string>>(
    preCheckedAlertId ? new Set([preCheckedAlertId]) : new Set()
  )
  const [focus, setFocus] = useState("")
  const [loading, setLoading] = useState(false)

  const activeAlerts = alerts.filter((a) => a.status === "active")
  const critical = activeAlerts.filter((a) => a.severity === "critical")
  const moderate = activeAlerts.filter((a) => a.severity === "moderate")
  const low = activeAlerts.filter((a) => a.severity === "low")

  const toggle = (id: string) =>
    setCheckedIds((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })

  const handleGenerate = () => {
    if (checkedIds.size === 0) return
    setLoading(true)
    // Simulate AI generation delay, then return a mock plan
    setTimeout(() => {
      const existing = MOCK_ACTION_PLANS.find((p) => p.seniorId === seniorId)
      if (existing) {
        onGenerate({ ...existing, id: `plan-new-${Date.now()}`, status: "open", chosenOptionLevel: null, caregiverNotes: "", linkedAlertIds: Array.from(checkedIds) })
      }
      setLoading(false)
    }, 1400)
  }

  const AlertRow = ({ alert }: { alert: Alert }) => (
    <label
      key={alert.id}
      className="flex items-start gap-2.5 p-2.5 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800/50 cursor-pointer"
    >
      <input
        type="checkbox"
        className="mt-0.5 accent-[#1D9E75]"
        checked={checkedIds.has(alert.id)}
        onChange={() => toggle(alert.id)}
      />
      <div>
        <p className="text-sm font-medium text-gray-800 dark:text-gray-200">{alert.title}</p>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 line-clamp-1">{alert.description}</p>
      </div>
    </label>
  )

  const SeverityGroup = ({ label, color, items }: { label: string; color: string; items: Alert[] }) =>
    items.length === 0 ? null : (
      <div>
        <p className={`text-[10px] font-semibold uppercase tracking-wider mb-1 ${color}`}>{label}</p>
        {items.map((a) => <AlertRow key={a.id} alert={a} />)}
      </div>
    )

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] flex flex-col border border-gray-200 dark:border-gray-700">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-800">
          <div>
            <h2 className="text-base font-semibold text-gray-900 dark:text-white">Generate Action Plan</h2>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Select the alerts to address</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Alert list */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
          {activeAlerts.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-6">No active alerts to address.</p>
          ) : (
            <>
              <SeverityGroup label="Critical" color="text-red-500" items={critical} />
              <SeverityGroup label="Moderate" color="text-amber-500" items={moderate} />
              <SeverityGroup label="Low" color="text-gray-400" items={low} />
            </>
          )}

          {/* Focus note */}
          <div className="pt-2">
            <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5 block">
              Additional focus or context (optional)
            </label>
            <textarea
              value={focus}
              onChange={(e) => setFocus(e.target.value)}
              rows={2}
              placeholder="e.g. family prefers non-medication approaches..."
              className="w-full text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-3 py-2 text-gray-800 dark:text-gray-200 placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-[#1D9E75]/30 resize-none"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-gray-100 dark:border-gray-800 flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={onClose} className="flex-1 text-sm h-9">
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={handleGenerate}
            disabled={checkedIds.size === 0 || loading}
            className="flex-1 text-sm h-9 bg-[#1D9E75] hover:bg-[#187E5D] text-white"
          >
            {loading ? (
              <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> Generating…</>
            ) : (
              <><Sparkles className="h-3.5 w-3.5 mr-1.5" /> Generate Plan</>
            )}
          </Button>
        </div>
      </div>
    </div>
  )
}

// ─── Option Card ──────────────────────────────────────────────────────────────

interface OptionCardProps {
  option: ActionOption
  chosen: boolean
  onChoose: () => void
}

function OptionCard({ option, chosen, onChoose }: OptionCardProps) {
  const lCfg = levelConfig[option.level]
  const dCfg = difficultyConfig[option.difficulty]

  return (
    <div
      className={`rounded-xl border-2 p-4 transition-all ${chosen ? lCfg.ring + " shadow-sm" : "border-gray-100 dark:border-gray-800"}`}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-2">
          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${lCfg.accent}`}>
            {lCfg.label}
          </span>
          <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${dCfg.color}`}>
            {dCfg.label}
          </span>
        </div>
        {chosen && <CheckCircle2 className="h-4 w-4 text-[#1D9E75] shrink-0" />}
      </div>

      <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-1">{option.title}</h4>
      <p className="text-xs text-gray-600 dark:text-gray-400 leading-relaxed mb-3">{option.description}</p>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] text-gray-500 dark:text-gray-400 mb-3">
        <span><span className="font-medium">Cost:</span> {option.estimatedCost}</span>
        <span><span className="font-medium">Timeline:</span> {option.timeToComplete}</span>
      </div>

      <Button
        variant={chosen ? "outline" : "ghost"}
        size="sm"
        onClick={onChoose}
        className={`w-full text-xs h-8 ${chosen ? "border-[#1D9E75] text-[#1D9E75] hover:bg-[#E8F7F2] dark:hover:bg-[#1D9E75]/10" : ""}`}
      >
        {chosen ? (
          <><CheckCircle2 className="h-3 w-3 mr-1.5" /> Chosen approach</>
        ) : (
          <><Circle className="h-3 w-3 mr-1.5" /> Mark as chosen</>
        )}
      </Button>
    </div>
  )
}

// ─── Plan Card ────────────────────────────────────────────────────────────────

interface PlanCardProps {
  plan: ActionPlan
  alerts: Alert[]
  onUpdate: (updated: ActionPlan) => void
}

function PlanCard({ plan, alerts, onUpdate }: PlanCardProps) {
  const [openSection, setOpenSection] = useState<"actions" | "costs" | "resources" | null>("actions")
  const [notes, setNotes] = useState(plan.caregiverNotes)

  const toggle = (s: "actions" | "costs" | "resources") =>
    setOpenSection((prev) => (prev === s ? null : s))

  const linkedAlerts = alerts.filter((a) => plan.linkedAlertIds.includes(a.id))

  const statusBadge = {
    open: { label: "Open", variant: "warning" as const },
    in_progress: { label: "In Progress", variant: "default" as const },
    complete: { label: "Complete", variant: "success" as const },
  }[plan.status]

  return (
    <Card className="border-border dark:border-gray-800 dark:bg-gray-900 overflow-hidden">
      {/* Header */}
      <CardHeader className="px-5 pt-5 pb-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white leading-snug">{plan.title}</h3>
            <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5">
              Generated {formatRelativeTime(plan.generatedAt)}
            </p>
          </div>
          <Badge variant={statusBadge.variant} className="text-[10px] shrink-0">{statusBadge.label}</Badge>
        </div>

        <p className="text-xs text-gray-600 dark:text-gray-400 leading-relaxed mt-2">{plan.summary}</p>

        {/* Linked alerts */}
        {linkedAlerts.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-2">
            {linkedAlerts.map((a) => (
              <span
                key={a.id}
                className="text-[10px] px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 font-medium"
              >
                {a.title}
              </span>
            ))}
          </div>
        )}
      </CardHeader>

      <CardContent className="px-5 pb-5 space-y-2">
        {/* What to do */}
        <div className="rounded-lg border border-gray-100 dark:border-gray-800 overflow-hidden">
          <button
            onClick={() => toggle("actions")}
            className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
          >
            <span className="text-xs font-semibold text-gray-800 dark:text-gray-200">What to do</span>
            {openSection === "actions" ? <ChevronUp className="h-3.5 w-3.5 text-gray-400" /> : <ChevronDown className="h-3.5 w-3.5 text-gray-400" />}
          </button>
          {openSection === "actions" && (
            <div className="px-4 pb-4 space-y-3 border-t border-gray-100 dark:border-gray-800 pt-3">
              {plan.immediateActions.map((opt) => (
                <OptionCard
                  key={opt.level}
                  option={opt}
                  chosen={plan.chosenOptionLevel === opt.level}
                  onChoose={() => onUpdate({ ...plan, chosenOptionLevel: opt.level })}
                />
              ))}
            </div>
          )}
        </div>

        {/* Costs */}
        <div className="rounded-lg border border-gray-100 dark:border-gray-800 overflow-hidden">
          <button
            onClick={() => toggle("costs")}
            className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
          >
            <span className="text-xs font-semibold text-gray-800 dark:text-gray-200">Financial considerations</span>
            {openSection === "costs" ? <ChevronUp className="h-3.5 w-3.5 text-gray-400" /> : <ChevronDown className="h-3.5 w-3.5 text-gray-400" />}
          </button>
          {openSection === "costs" && (
            <div className="px-4 pb-4 pt-3 border-t border-gray-100 dark:border-gray-800">
              <p className="text-xs text-gray-600 dark:text-gray-400 leading-relaxed">{plan.financialConsiderations}</p>
            </div>
          )}
        </div>

        {/* Resources */}
        <div className="rounded-lg border border-gray-100 dark:border-gray-800 overflow-hidden">
          <button
            onClick={() => toggle("resources")}
            className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
          >
            <span className="text-xs font-semibold text-gray-800 dark:text-gray-200">
              Resources <span className="font-normal text-gray-400">({plan.resources.length})</span>
            </span>
            {openSection === "resources" ? <ChevronUp className="h-3.5 w-3.5 text-gray-400" /> : <ChevronDown className="h-3.5 w-3.5 text-gray-400" />}
          </button>
          {openSection === "resources" && (
            <div className="px-4 pb-4 pt-3 border-t border-gray-100 dark:border-gray-800 space-y-3">
              {plan.resources.map((r, i) => {
                const Icon = resourceTypeIcon[r.type] ?? BookOpen
                return (
                  <div key={i} className="flex items-start gap-2.5">
                    <div className="w-6 h-6 rounded-md bg-gray-100 dark:bg-gray-800 flex items-center justify-center shrink-0 mt-0.5">
                      <Icon className="h-3 w-3 text-gray-500 dark:text-gray-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <p className="text-xs font-semibold text-gray-800 dark:text-gray-200">{r.name}</p>
                        {r.localToSenior && (
                          <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-[#E8F7F2] dark:bg-[#1D9E75]/10 text-[#1D9E75] dark:text-[#4DC8A0] font-medium">
                            Local
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-gray-500 dark:text-gray-400 leading-snug mt-0.5">{r.description}</p>
                      <div className="flex items-center gap-3 mt-1 text-[10px] text-gray-400 dark:text-gray-500">
                        <span>{r.estimatedCost}</span>
                        <span className="flex items-center gap-0.5">
                          <ExternalLink className="h-2.5 w-2.5" />
                          {r.contactOrLink}
                        </span>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Caregiver notes */}
        <div className="pt-1">
          <label className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-1.5 block">
            Caregiver notes
          </label>
          <textarea
            value={notes}
            onChange={(e) => {
              setNotes(e.target.value)
              onUpdate({ ...plan, caregiverNotes: e.target.value })
            }}
            rows={2}
            placeholder="Add notes for the care team…"
            className="w-full text-xs rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-3 py-2 text-gray-800 dark:text-gray-200 placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-[#1D9E75]/30 resize-none"
          />
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 pt-2">
          <Button
            variant="outline"
            size="sm"
            className="flex-1 text-xs h-8"
            onClick={() => onUpdate({ ...plan, status: plan.status === "complete" ? "open" : "complete" })}
          >
            {plan.status === "complete" ? (
              <><Circle className="h-3 w-3 mr-1.5" /> Reopen</>
            ) : (
              <><CheckCircle2 className="h-3 w-3 mr-1.5" /> Mark complete</>
            )}
          </Button>
          <Button variant="ghost" size="sm" className="text-xs h-8 px-3 text-gray-500">
            <Share2 className="h-3 w-3 mr-1.5" />
            Share
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

// ─── Main SeniorTabs component ────────────────────────────────────────────────

interface SeniorTabsProps {
  seniorId: string
}

export function SeniorTabs({ seniorId }: SeniorTabsProps) {
  const searchParams = useSearchParams()
  const router = useRouter()

  const preCheckedAlertId = searchParams.get("newplan") ?? null

  const [activeTab, setActiveTab] = useState("action-plans")
  const [showModal, setShowModal] = useState(preCheckedAlertId !== null)
  const [plans, setPlans] = useState<ActionPlan[]>(
    MOCK_ACTION_PLANS.filter((p) => p.seniorId === seniorId)
  )

  const alerts = MOCK_ALERTS.filter((a) => a.seniorId === seniorId)

  const openPlans = plans.filter((p) => p.status !== "complete")

  const handleTabChange = (value: string) => {
    setActiveTab(value)
    const params = new URLSearchParams(searchParams.toString())
    params.set("tab", value)
    params.delete("newplan")
    router.replace(`?${params.toString()}`, { scroll: false })
  }

  const handleGenerate = (plan: ActionPlan) => {
    setPlans((prev) => [plan, ...prev])
    setShowModal(false)
  }

  const handleUpdatePlan = (updated: ActionPlan) => {
    setPlans((prev) => prev.map((p) => (p.id === updated.id ? updated : p)))
  }

  return (
    <>
      {showModal && (
        <GenerateModal
          seniorId={seniorId}
          alerts={alerts}
          onGenerate={handleGenerate}
          onClose={() => setShowModal(false)}
          preCheckedAlertId={preCheckedAlertId}
        />
      )}

      <Tabs value={activeTab} onValueChange={handleTabChange}>
        <TabsList className="mb-4">
          <TabsTrigger value="action-plans" className="flex items-center gap-1.5 text-sm">
            <ClipboardList className="h-3.5 w-3.5" />
            Action Plans
            {openPlans.length > 0 && (
              <span className="ml-1 text-[10px] bg-[#1D9E75]/10 text-[#1D9E75] dark:text-[#4DC8A0] rounded-full px-1.5 py-0.5 font-medium">
                {openPlans.length}
              </span>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="action-plans">
          <div className="space-y-4">
            {/* Generate button */}
            <div className="flex items-center justify-between">
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {plans.length === 0 ? "No action plans yet" : `${plans.length} plan${plans.length !== 1 ? "s" : ""}`}
              </p>
              <Button
                size="sm"
                onClick={() => setShowModal(true)}
                className="bg-[#1D9E75] hover:bg-[#187E5D] text-white text-xs h-8"
              >
                <Sparkles className="h-3.5 w-3.5 mr-1.5" />
                Generate Action Plan
              </Button>
            </div>

            {plans.length === 0 ? (
              <Card className="border-border dark:border-gray-800 dark:bg-gray-900">
                <CardContent className="p-10 text-center">
                  <ClipboardList className="h-8 w-8 text-gray-300 dark:text-gray-600 mx-auto mb-2" />
                  <p className="text-sm font-medium text-gray-600 dark:text-gray-400">No action plans yet</p>
                  <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                    Generate a plan from active alerts to get care recommendations.
                  </p>
                  <Button
                    size="sm"
                    onClick={() => setShowModal(true)}
                    className="mt-4 bg-[#1D9E75] hover:bg-[#187E5D] text-white text-xs h-8"
                  >
                    <Sparkles className="h-3.5 w-3.5 mr-1.5" />
                    Generate Action Plan
                  </Button>
                </CardContent>
              </Card>
            ) : (
              plans.map((plan) => (
                <PlanCard key={plan.id} plan={plan} alerts={alerts} onUpdate={handleUpdatePlan} />
              ))
            )}
          </div>
        </TabsContent>
      </Tabs>
    </>
  )
}
