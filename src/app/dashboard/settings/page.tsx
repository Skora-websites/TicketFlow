"use client";

import { useEffect, useRef, useState } from "react";
import { useSession, signOut } from "next-auth/react";
import { useTheme } from "next-themes";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AvatarCropDialog } from "@/components/ui/avatar-crop-dialog";
import { Camera, Trash2, Sun, Moon, Laptop, Palette } from "lucide-react";
import { useColorTheme } from "@/components/ColorThemeProvider";

export default function SettingsPage() {
  const { data: session, update } = useSession();
  const user = session?.user;
  const { theme, setTheme } = useTheme();
  const { colorTheme, setColorTheme } = useColorTheme();
  const [mounted, setMounted] = useState(false);

  const [profile, setProfile] = useState({ name: "", email: "" });
  const [avatar, setAvatar] = useState<string | null>(null);
  const [avatarDirty, setAvatarDirty] = useState(false);
  const [pw, setPw] = useState({ current: "", next: "", confirm: "" });
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPw, setSavingPw] = useState(false);

  // Avatar crop modal state
  const [cropImageSrc, setCropImageSrc] = useState<string | null>(null);
  const [isCropOpen, setIsCropOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (user) {
      setProfile({ name: user.name ?? "", email: user.email ?? "" });
      setAvatar(user.image ?? null);
    }
    fetch("/api/users/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.user) {
          setProfile({ name: data.user.name ?? "", email: data.user.email ?? "" });
          if (data.user.avatar !== undefined) setAvatar(data.user.avatar);
        }
      })
      .catch(() => {});
  }, [user]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Please select a valid image file");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setCropImageSrc(reader.result as string);
      setIsCropOpen(true);
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const handleCropComplete = (croppedDataUrl: string) => {
    setAvatar(croppedDataUrl);
    setAvatarDirty(true);
  };

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault();
    setSavingProfile(true);
    try {
      const payload: Record<string, unknown> = {
        name: profile.name,
        email: profile.email,
      };
      if (avatarDirty) {
        payload.avatar = avatar;
      }

      const res = await fetch("/api/users/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to update profile");

      setAvatarDirty(false);
      const avatarUrl = user?.id ? `/api/users/${user.id}/avatar?t=${Date.now()}` : null;
      await update({
        name: data.user?.name ?? profile.name,
        image: avatar ? avatarUrl : null,
      });
      toast.success("Profile updated");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update profile");
    } finally {
      setSavingProfile(false);
    }
  }

  async function savePassword(e: React.FormEvent) {
    e.preventDefault();
    if (pw.next !== pw.confirm) {
      toast.error("New passwords do not match");
      return;
    }
    setSavingPw(true);
    try {
      const res = await fetch("/api/users/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword: pw.current, newPassword: pw.next }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to change password");
      setPw({ current: "", next: "", confirm: "" });
      toast.success("Password changed — please sign in again");
      // The server invalidates all sessions on password change (including
      // this one), so sign out cleanly instead of letting the next request 401.
      setTimeout(() => signOut({ callbackUrl: "/login" }), 800);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to change password");
    } finally {
      setSavingPw(false);
    }
  }

  return (
    <DashboardLayout>
      <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="page-header-title">Settings</h1>
        <p className="page-header-sub">Manage your profile and account security</p>
      </div>

      <Card className="card-elevated">
        <CardHeader>
          <CardTitle>Profile</CardTitle>
          <p className="text-sm text-muted-foreground">Update your photo, name, and email address</p>
        </CardHeader>
        <CardContent>
          {/* Avatar Section */}
          <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center">
            <div className="relative group flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-full border-2 border-border bg-secondary shadow-sm">
              {avatar ? (
                <img
                  src={avatar}
                  alt={profile.name || "Profile avatar"}
                  className="h-full w-full object-cover"
                />
              ) : (
                <span className="text-xl font-bold uppercase text-muted-foreground">
                  {profile.name?.charAt(0) || "U"}
                </span>
              )}
            </div>

            <div className="space-y-1.5">
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                  className="gap-2 font-semibold"
                >
                  <Camera className="h-4 w-4" />
                  {avatar ? "Change photo" : "Upload photo"}
                </Button>
                {avatar && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setAvatar(null);
                      setAvatarDirty(true);
                    }}
                    className="text-destructive hover:text-destructive hover:bg-destructive/10 font-semibold"
                  >
                    <Trash2 className="h-4 w-4 mr-1.5" />
                    Remove
                  </Button>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                Move and crop your picture in a circle. Supports JPG, PNG, and WebP.
              </p>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                onChange={handleFileSelect}
                className="hidden"
                aria-label="Upload profile photo"
              />
            </div>
          </div>

          <form onSubmit={saveProfile} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                value={profile.name}
                onChange={(e) => setProfile({ ...profile, name: e.target.value })}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={profile.email}
                onChange={(e) => setProfile({ ...profile, email: e.target.value })}
                required
              />
            </div>
            <Button type="submit" disabled={savingProfile} className="w-full sm:w-auto h-9.5 sm:h-8.5 font-bold">
              {savingProfile ? "Saving..." : "Save profile"}
            </Button>
          </form>

          {/* Avatar Circular Cropper Dialog */}
          <AvatarCropDialog
            open={isCropOpen}
            onOpenChange={setIsCropOpen}
            imageSrc={cropImageSrc}
            onCropComplete={handleCropComplete}
          />
        </CardContent>
      </Card>

      <Card className="card-elevated">
        <CardHeader>
          <CardTitle>Change Password</CardTitle>
          <p className="text-sm text-muted-foreground">Enter your current password to set a new one</p>
        </CardHeader>
        <CardContent>
          <form onSubmit={savePassword} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="current">Current password</Label>
              <Input
                id="current"
                type="password"
                value={pw.current}
                onChange={(e) => setPw({ ...pw, current: e.target.value })}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="next">New password</Label>
              <Input
                id="next"
                type="password"
                minLength={8}
                value={pw.next}
                onChange={(e) => setPw({ ...pw, next: e.target.value })}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm">Confirm new password</Label>
              <Input
                id="confirm"
                type="password"
                minLength={8}
                value={pw.confirm}
                onChange={(e) => setPw({ ...pw, confirm: e.target.value })}
                required
              />
            </div>
            <Button type="submit" disabled={savingPw} className="w-full sm:w-auto h-9.5 sm:h-8.5 font-bold">
              {savingPw ? "Saving..." : "Change password"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card className="card-elevated">
        <CardHeader>
          <CardTitle>Appearance</CardTitle>
          <p className="text-sm text-muted-foreground">Customize your interface mode and accent color</p>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2.5">
            <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Interface Mode</Label>
            <div className="grid grid-cols-3 gap-3">
              <Button
                type="button"
                variant={mounted && theme === "dark" ? "default" : "outline"}
                onClick={async () => {
                  setTheme("dark");
                  try {
                    await fetch("/api/users/me", {
                      method: "PATCH",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ theme: "dark" }),
                    });
                    await update({ theme: "dark" });
                  } catch {}
                }}
                className="w-full font-semibold flex items-center justify-center gap-2"
              >
                <Moon className="h-4 w-4 shrink-0" />
                Dark
              </Button>
              <Button
                type="button"
                variant={mounted && theme === "light" ? "default" : "outline"}
                onClick={async () => {
                  setTheme("light");
                  try {
                    await fetch("/api/users/me", {
                      method: "PATCH",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ theme: "light" }),
                    });
                    await update({ theme: "light" });
                  } catch {}
                }}
                className="w-full font-semibold flex items-center justify-center gap-2"
              >
                <Sun className="h-4 w-4 shrink-0" />
                Light
              </Button>
              <Button
                type="button"
                variant={mounted && theme === "system" ? "default" : "outline"}
                onClick={async () => {
                  setTheme("system");
                  try {
                    await fetch("/api/users/me", {
                      method: "PATCH",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ theme: "system" }),
                    });
                    await update({ theme: "system" });
                  } catch {}
                }}
                className="w-full font-semibold flex items-center justify-center gap-2"
              >
                <Laptop className="h-4 w-4 shrink-0" />
                System
              </Button>
            </div>
          </div>

          <div className="space-y-2.5">
            <div className="flex items-center gap-2">
              <Palette className="h-4 w-4 text-muted-foreground" />
              <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Color Theme</Label>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Button
                type="button"
                variant={mounted && colorTheme === "rose" ? "default" : "outline"}
                onClick={() => setColorTheme("rose")}
                className="w-full font-semibold flex items-center justify-center gap-2.5"
              >
                <span className="h-3 w-3 rounded-full bg-[#F399B3] ring-1 ring-border shrink-0" />
                Berry / Rose
              </Button>
              <Button
                type="button"
                variant={mounted && colorTheme === "purple" ? "default" : "outline"}
                onClick={() => setColorTheme("purple")}
                className="w-full font-semibold flex items-center justify-center gap-2.5"
              >
                <span className="h-3 w-3 rounded-full bg-[#C4A7FF] ring-1 ring-border shrink-0" />
                Lilac / Purple
              </Button>
              <Button
                type="button"
                variant={mounted && colorTheme === "lime" ? "default" : "outline"}
                onClick={() => setColorTheme("lime")}
                className="w-full font-semibold flex items-center justify-center gap-2.5"
              >
                <span className="h-3 w-3 rounded-full bg-[#B8F23D] ring-1 ring-border shrink-0" />
                Forest / Lime
              </Button>
              <Button
                type="button"
                variant={mounted && colorTheme === "brown" ? "default" : "outline"}
                onClick={() => setColorTheme("brown")}
                className="w-full font-semibold flex items-center justify-center gap-2.5"
              >
                <span className="h-3 w-3 rounded-full bg-[#DCA96F] ring-1 ring-border shrink-0" />
                Cream / Brown
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
      </div>
    </DashboardLayout>
  );
}
