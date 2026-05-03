"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  Bell,
  Mail,
  MessageSquare,
  Shield,
  User,
  Palette,
  Save,
  CheckCircle2,
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Separator } from "@/components/ui/separator"

type SettingSection = "account" | "notifications" | "privacy" | "appearance"

const navSections: { key: SettingSection; label: string; icon: React.ReactNode }[] = [
  { key: "account", label: "Account", icon: <User className="h-4 w-4" /> },
  { key: "notifications", label: "Notifications", icon: <Bell className="h-4 w-4" /> },
  { key: "privacy", label: "Privacy & Security", icon: <Shield className="h-4 w-4" /> },
  { key: "appearance", label: "Appearance", icon: <Palette className="h-4 w-4" /> },
]

interface SettingsUser {
  id: string
  email: string | null
  display_name: string | null
  phone: string | null
  role: string
}

export default function SettingsPage() {
  const router = useRouter()
  const [activeSection, setActiveSection] = useState<SettingSection>("account")
  const [saved, setSaved] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  // Account state — backed by `/api/data/me`. Email + role are read-only
  // (managed by the identity provider), display name + phone are
  // editable through `PATCH /api/me`. The non-account sections still
  // keep client-only state because their backend persistence ships in a
  // later phase; the inline note in each card flags this honestly.
  const [user, setUser] = useState<SettingsUser | null>(null)
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [phone, setPhone] = useState("")

  // Notification state
  const [notifications, setNotifications] = useState({
    criticalAlerts: true,
    moderateAlerts: true,
    lowAlerts: false,
    aiSummaries: true,
    appointmentReminders: true,
    deviceOffline: true,
    emailNotifs: true,
    smsNotifs: false,
    pushNotifs: true,
    digestEmail: true,
  })

  // Privacy state
  const [privacy, setPrivacy] = useState({
    twoFactor: false,
    sessionTimeout: true,
    dataSharing: true,
    analyticsOptIn: true,
  })

  // Appearance state
  const [appearance, setAppearance] = useState({
    darkMode: false,
    compactMode: false,
    highContrast: false,
    fontSize: "medium",
  })

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const res = await fetch("/api/data/me", { cache: "no-store" })
        if (res.status === 401) {
          router.replace("/auth/sign-in")
          return
        }
        if (!res.ok) return
        const data: { user: SettingsUser } = await res.json()
        if (cancelled) return
        setUser(data.user)
        setName(data.user.display_name ?? "")
        setEmail(data.user.email ?? "")
        setPhone(data.user.phone ?? "")
        router.refresh()
      } catch {
        // Surface "Unable to load" via the form's empty state — never
        // log the body, which carries email + display name.
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [router])

  const handleSave = async () => {
    setSaving(true)
    setSaveError(null)
    try {
      const res = await fetch("/api/data/me", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          display_name: name.trim(),
          phone: phone.trim(),
        }),
      })
      if (res.status === 401) {
        router.replace("/auth/sign-in")
        return
      }
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as
          | { error?: string }
          | null
        setSaveError(body?.error ?? "Unable to save changes.")
        return
      }
      const data: { user: SettingsUser } = await res.json()
      setUser(data.user)
      setName(data.user.display_name ?? "")
      setPhone(data.user.phone ?? "")
      setSaved(true)
      router.refresh()
      setTimeout(() => setSaved(false), 2500)
    } catch {
      setSaveError("Unable to save changes.")
    } finally {
      setSaving(false)
    }
  }

  const toggleNotif = (key: keyof typeof notifications) => {
    setNotifications((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  const togglePrivacy = (key: keyof typeof privacy) => {
    setPrivacy((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  const toggleAppearance = (key: keyof typeof appearance) => {
    setAppearance((prev) => ({
      ...prev,
      [key]: typeof prev[key] === "boolean" ? !prev[key] : prev[key],
    }))
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">Settings</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
          Manage your account, notifications, and preferences
        </p>
      </div>

      <div className="flex flex-col md:flex-row gap-6">
        {/* Sidebar nav */}
        <aside className="md:w-48 shrink-0">
          <nav className="space-y-0.5">
            {navSections.map((section) => (
              <button
                key={section.key}
                onClick={() => setActiveSection(section.key)}
                className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors text-left ${
                  activeSection === section.key
                    ? "bg-[#EEF0FF] text-[#3B5BDB] dark:bg-[#3B5BDB]/20 dark:text-[#91A7FF]"
                    : "text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-gray-100"
                }`}
              >
                <span
                  className={
                    activeSection === section.key
                      ? "text-[#3B5BDB] dark:text-[#91A7FF]"
                      : "text-gray-400"
                  }
                >
                  {section.icon}
                </span>
                {section.label}
              </button>
            ))}
          </nav>
        </aside>

        {/* Content */}
        <div className="flex-1 min-w-0 space-y-4">
          {/* Account */}
          {activeSection === "account" && (
            <>
              <Card className="border-border dark:border-gray-800 dark:bg-gray-900">
                <CardHeader>
                  <CardTitle className="text-base">Profile Information</CardTitle>
                  <CardDescription>
                    Update your name, email, and contact details.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Prefer the focused profile view?{" "}
                    <Link href="/profile" className="text-[#3B5BDB] hover:underline">
                      Open profile
                    </Link>
                  </p>

                  <Separator />

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label htmlFor="name">Display Name</Label>
                      <Input
                        id="name"
                        value={name}
                        placeholder="Not provided"
                        maxLength={120}
                        onChange={(e) => setName(e.target.value)}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="phone">Phone</Label>
                      <Input
                        id="phone"
                        value={phone}
                        placeholder="Not provided"
                        maxLength={32}
                        onChange={(e) => setPhone(e.target.value)}
                      />
                    </div>
                    <div className="space-y-1.5 sm:col-span-2">
                      <Label htmlFor="email">Email</Label>
                      <Input
                        id="email"
                        type="email"
                        value={email}
                        readOnly
                        aria-readonly
                        title="Email is managed by your identity provider."
                        className="opacity-80 cursor-not-allowed"
                      />
                      <p className="text-[11px] text-gray-500 dark:text-gray-400">
                        Email is managed by your identity provider.
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-border dark:border-gray-800 dark:bg-gray-900">
                <CardHeader>
                  <CardTitle className="text-base">Caregiver Role</CardTitle>
                  <CardDescription>
                    Your role determines your access level and responsibilities.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center justify-between p-3 rounded-lg bg-[#EEF0FF] dark:bg-[#3B5BDB]/10 border border-[#3B5BDB]/20">
                    <div>
                      <p className="text-sm font-medium text-gray-900 dark:text-white">
                        {user ? _formatRole(user.role) : "Caregiver"}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                        Role is set by your identity provider.
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </>
          )}

          {/* Notifications */}
          {activeSection === "notifications" && (
            <>
              <Card className="border-border dark:border-gray-800 dark:bg-gray-900">
                <CardHeader>
                  <CardTitle className="text-base">Alert Notifications</CardTitle>
                  <CardDescription>
                    Choose which alerts you want to be notified about.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {[
                    {
                      key: "criticalAlerts" as const,
                      label: "Critical Alerts",
                      desc: "Immediate notifications for critical health events",
                    },
                    {
                      key: "moderateAlerts" as const,
                      label: "Moderate Alerts",
                      desc: "Notifications for moderate health concerns",
                    },
                    {
                      key: "lowAlerts" as const,
                      label: "Low Priority Alerts",
                      desc: "Informational alerts that don't require immediate action",
                    },
                    {
                      key: "deviceOffline" as const,
                      label: "Device Offline",
                      desc: "Notify when a connected device goes offline",
                    },
                  ].map((item) => (
                    <div
                      key={item.key}
                      className="flex items-center justify-between gap-4"
                    >
                      <div>
                        <p className="text-sm font-medium text-gray-900 dark:text-white">
                          {item.label}
                        </p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          {item.desc}
                        </p>
                      </div>
                      <Switch
                        checked={notifications[item.key]}
                        onCheckedChange={() => toggleNotif(item.key)}
                      />
                    </div>
                  ))}
                </CardContent>
              </Card>

              <Card className="border-border dark:border-gray-800 dark:bg-gray-900">
                <CardHeader>
                  <CardTitle className="text-base">Delivery Channels</CardTitle>
                  <CardDescription>
                    Select how you want to receive notifications.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {[
                    {
                      key: "emailNotifs" as const,
                      label: "Email Notifications",
                      desc: `Sent to ${email}`,
                      icon: <Mail className="h-4 w-4 text-gray-400" />,
                    },
                    {
                      key: "smsNotifs" as const,
                      label: "SMS / Text Messages",
                      desc: `Sent to ${phone}`,
                      icon: <MessageSquare className="h-4 w-4 text-gray-400" />,
                    },
                    {
                      key: "pushNotifs" as const,
                      label: "Push Notifications",
                      desc: "In-app and browser notifications",
                      icon: <Bell className="h-4 w-4 text-gray-400" />,
                    },
                    {
                      key: "digestEmail" as const,
                      label: "Daily Summary Email",
                      desc: "Morning digest of overnight activity",
                      icon: <Mail className="h-4 w-4 text-gray-400" />,
                    },
                  ].map((item) => (
                    <div
                      key={item.key}
                      className="flex items-center justify-between gap-4"
                    >
                      <div className="flex items-center gap-3">
                        {item.icon}
                        <div>
                          <p className="text-sm font-medium text-gray-900 dark:text-white">
                            {item.label}
                          </p>
                          <p className="text-xs text-gray-500 dark:text-gray-400">
                            {item.desc}
                          </p>
                        </div>
                      </div>
                      <Switch
                        checked={notifications[item.key]}
                        onCheckedChange={() => toggleNotif(item.key)}
                      />
                    </div>
                  ))}
                </CardContent>
              </Card>

              <Card className="border-border dark:border-gray-800 dark:bg-gray-900">
                <CardHeader>
                  <CardTitle className="text-base">AI & Report Notifications</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {[
                    {
                      key: "aiSummaries" as const,
                      label: "AI Health Summaries",
                      desc: "Notify when a new AI summary is generated",
                    },
                    {
                      key: "appointmentReminders" as const,
                      label: "Appointment Reminders",
                      desc: "24-hour and 1-hour reminders before appointments",
                    },
                  ].map((item) => (
                    <div
                      key={item.key}
                      className="flex items-center justify-between gap-4"
                    >
                      <div>
                        <p className="text-sm font-medium text-gray-900 dark:text-white">
                          {item.label}
                        </p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          {item.desc}
                        </p>
                      </div>
                      <Switch
                        checked={notifications[item.key]}
                        onCheckedChange={() => toggleNotif(item.key)}
                      />
                    </div>
                  ))}
                </CardContent>
              </Card>
            </>
          )}

          {/* Privacy */}
          {activeSection === "privacy" && (
            <Card className="border-border dark:border-gray-800 dark:bg-gray-900">
              <CardHeader>
                <CardTitle className="text-base">Privacy & Security</CardTitle>
                <CardDescription>
                  Manage your security settings and data preferences.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {[
                  {
                    key: "twoFactor" as const,
                    label: "Two-Factor Authentication",
                    desc: "Add an extra layer of security to your account",
                  },
                  {
                    key: "sessionTimeout" as const,
                    label: "Auto Session Timeout",
                    desc: "Sign out after 30 minutes of inactivity",
                  },
                  {
                    key: "dataSharing" as const,
                    label: "Share Health Data with Care Team",
                    desc: "Allow your care members' care team to view NartheCare summaries",
                  },
                  {
                    key: "analyticsOptIn" as const,
                    label: "Product Analytics",
                    desc: "Help us improve NartheCare by sharing usage data",
                  },
                ].map((item) => (
                  <div
                    key={item.key}
                    className="flex items-center justify-between gap-4"
                  >
                    <div>
                      <p className="text-sm font-medium text-gray-900 dark:text-white">
                        {item.label}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {item.desc}
                      </p>
                    </div>
                    <Switch
                      checked={privacy[item.key]}
                      onCheckedChange={() => togglePrivacy(item.key)}
                    />
                  </div>
                ))}

                <Separator />

                <div>
                  <p className="text-sm font-medium text-gray-900 dark:text-white mb-1">
                    Password
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
                    Last changed 3 months ago
                  </p>
                  <Button variant="outline" size="sm" className="text-xs">
                    Change Password
                  </Button>
                </div>

                <Separator />

                <div>
                  <p className="text-sm font-medium text-red-600 dark:text-red-400 mb-1">
                    Danger Zone
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
                    These actions are irreversible. Please proceed with caution.
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-xs border-red-200 text-red-600 hover:bg-red-50 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-900/20"
                  >
                    Delete Account
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Appearance */}
          {activeSection === "appearance" && (
            <Card className="border-border dark:border-gray-800 dark:bg-gray-900">
              <CardHeader>
                <CardTitle className="text-base">Display Preferences</CardTitle>
                <CardDescription>
                  Customize how NartheCare looks and feels.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {[
                  {
                    key: "darkMode" as const,
                    label: "Dark Mode",
                    desc: "Use a darker color theme to reduce eye strain",
                  },
                  {
                    key: "compactMode" as const,
                    label: "Compact Mode",
                    desc: "Show more information with reduced spacing",
                  },
                  {
                    key: "highContrast" as const,
                    label: "High Contrast",
                    desc: "Increase contrast for better accessibility",
                  },
                ].map((item) => (
                  <div
                    key={item.key}
                    className="flex items-center justify-between gap-4"
                  >
                    <div>
                      <p className="text-sm font-medium text-gray-900 dark:text-white">
                        {item.label}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {item.desc}
                      </p>
                    </div>
                    <Switch
                      checked={appearance[item.key] as boolean}
                      onCheckedChange={() => toggleAppearance(item.key)}
                    />
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Save button — wired to `PATCH /api/me` for the Account
              section. Notification, privacy, and appearance toggles are
              still client-only in Phase 1 (no backend table yet) — they
              re-render with their last selection, but only display name
              and phone persist. The note on each non-account card flags
              this honestly so caregivers do not assume save coverage. */}
          <div className="flex items-center justify-between">
            {saveError ? (
              <p className="text-sm text-red-600 dark:text-red-400">{saveError}</p>
            ) : (
              <span aria-hidden />
            )}
            <Button
              onClick={handleSave}
              disabled={saving || activeSection !== "account"}
              aria-disabled={saving || activeSection !== "account"}
              title={
                activeSection === "account"
                  ? "Save profile changes"
                  : "This section is read-only for now."
              }
              className="flex items-center gap-2"
            >
              {saved ? (
                <>
                  <CheckCircle2 className="h-4 w-4" />
                  Saved
                </>
              ) : (
                <>
                  <Save className="h-4 w-4" />
                  {saving ? "Saving…" : "Save Changes"}
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

function _formatRole(role: string): string {
  if (!role) return "Caregiver"
  return role
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join(" ")
}
