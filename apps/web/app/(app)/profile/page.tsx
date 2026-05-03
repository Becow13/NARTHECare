"use client"

/**
 * `/profile` — caregiver's own user profile, wired to `/api/data/me`.
 *
 * Renders the canonical fields from the `users` table (name, email,
 * phone, role, created_at) and lets the caregiver edit display name +
 * phone via `PATCH /api/me`. Sensitive fields (role, status, email,
 * Cognito sub) are read-only by design — the backend's
 * `parseUserProfileUpdate` rejects any attempt to modify them so a
 * hijacked session cannot escalate via this surface.
 *
 * Fetch happens through the `/api/data/me` Route Handler (not a Server
 * Component) for the same reason every other `/api/data/**` page does:
 * the silent Cognito refresh inside `apiClient` writes back to the
 * sealed session cookie, which Next only permits inside Route Handlers
 * / Server Actions. The browser fetch picks up the rotated `Set-Cookie`
 * automatically.
 */

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Save, CheckCircle2 } from "lucide-react"

interface AuthenticatedUser {
  id: string
  email: string | null
  email_verified: boolean
  phone: string | null
  phone_verified: boolean
  display_name: string | null
  role: string
  status: string
  last_login_at: string | null
  created_at: string
  updated_at: string | null
}

type SaveStatus = "idle" | "saving" | "saved" | "error"

export default function ProfilePage() {
  const router = useRouter()
  const [user, setUser] = useState<AuthenticatedUser | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [displayName, setDisplayName] = useState("")
  const [phone, setPhone] = useState("")
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle")
  const [saveError, setSaveError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const res = await fetch("/api/data/me", { cache: "no-store" })
        if (res.status === 401) {
          router.replace("/auth/sign-in")
          return
        }
        if (!res.ok) {
          if (!cancelled) setLoadError("Unable to load your profile.")
          return
        }
        const data: { user: AuthenticatedUser } = await res.json()
        if (cancelled) return
        setUser(data.user)
        setDisplayName(data.user.display_name ?? "")
        setPhone(data.user.phone ?? "")
        router.refresh()
      } catch {
        if (!cancelled) setLoadError("Unable to load your profile.")
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [router])

  async function handleSave(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSaveStatus("saving")
    setSaveError(null)
    try {
      // Send empty strings so the backend's PATCH parser maps them
      // to "leave unchanged" — never silently clears a field.
      const res = await fetch("/api/data/me", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          display_name: displayName.trim(),
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
        setSaveStatus("error")
        setSaveError(body?.error ?? "Unable to save changes.")
        return
      }
      const data: { user: AuthenticatedUser } = await res.json()
      setUser(data.user)
      setDisplayName(data.user.display_name ?? "")
      setPhone(data.user.phone ?? "")
      setSaveStatus("saved")
      router.refresh()
      setTimeout(() => setSaveStatus("idle"), 2500)
    } catch {
      setSaveStatus("error")
      setSaveError("Unable to save changes.")
    }
  }

  if (loadError) {
    return (
      <div className="max-w-3xl mx-auto space-y-6">
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">Profile</h1>
        <Card className="border-border dark:border-gray-800 dark:bg-gray-900">
          <CardContent className="p-6 text-center">
            <p className="text-sm text-gray-500 dark:text-gray-400">{loadError}</p>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (user === null) {
    return (
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="h-8 w-48 rounded bg-gray-200 dark:bg-gray-800 animate-pulse" />
        <div className="h-64 rounded-lg bg-gray-100 dark:bg-gray-900 animate-pulse border border-border dark:border-gray-800" />
      </div>
    )
  }

  const roleLabel = _formatRole(user.role)
  const memberSince = _formatMemberSince(user.created_at)

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">Profile</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
          Your NARTHECare account
        </p>
      </div>

      <form onSubmit={handleSave} className="space-y-4">
        <Card className="border-border dark:border-gray-800 dark:bg-gray-900">
          <CardHeader>
            <CardTitle className="text-base">Profile Information</CardTitle>
            <CardDescription>
              Update your display name and phone. Email and role are managed by your
              identity provider.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="displayName">Display Name</Label>
                <Input
                  id="displayName"
                  value={displayName}
                  placeholder="Not provided"
                  onChange={(e) => setDisplayName(e.target.value)}
                  maxLength={120}
                  autoComplete="name"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="phone">Phone</Label>
                <Input
                  id="phone"
                  value={phone}
                  placeholder="Not provided"
                  onChange={(e) => setPhone(e.target.value)}
                  maxLength={32}
                  autoComplete="tel"
                  inputMode="tel"
                />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label>Email</Label>
                <ReadOnlyValue value={user.email} verified={user.email_verified} />
              </div>
              <div className="space-y-1.5">
                <Label>Role</Label>
                <ReadOnlyValue value={roleLabel} />
              </div>
              <div className="space-y-1.5">
                <Label>Member Since</Label>
                <ReadOnlyValue value={memberSince} />
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="flex items-center justify-between">
          {saveError ? (
            <p className="text-sm text-red-600 dark:text-red-400">{saveError}</p>
          ) : (
            <span aria-hidden />
          )}
          <Button
            type="submit"
            disabled={saveStatus === "saving"}
            className="flex items-center gap-2"
          >
            {saveStatus === "saved" ? (
              <>
                <CheckCircle2 className="h-4 w-4" /> Saved
              </>
            ) : (
              <>
                <Save className="h-4 w-4" />
                {saveStatus === "saving" ? "Saving…" : "Save Changes"}
              </>
            )}
          </Button>
        </div>
      </form>
    </div>
  )
}

function ReadOnlyValue({
  value,
  verified,
}: {
  value: string | null | undefined
  verified?: boolean
}) {
  const text = value && value.length > 0 ? value : "Not provided"
  return (
    <div className="flex items-center gap-2">
      <p className="text-sm text-gray-900 dark:text-white">{text}</p>
      {verified ? (
        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 font-medium">
          Verified
        </span>
      ) : null}
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

function _formatMemberSince(value: string): string {
  if (!value) return "Not provided"
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return "Not provided"
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  })
}
