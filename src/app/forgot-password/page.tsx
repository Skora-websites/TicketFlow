"use client";

import { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Mail, Loader2 } from "lucide-react";
import { AuthBrandPanel, AuthBrandHeader } from "@/components/auth/AuthBrandPanel";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [devResetUrl, setDevResetUrl] = useState("");

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch("/api/auth/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Request failed");
      setDevResetUrl(data.devResetUrl || "");
      setSent(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Request failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen grid lg:grid-cols-2 bg-background">
      <AuthBrandPanel />
      <main className="flex items-center justify-center px-4 py-10">
        <div className="w-full max-w-md">
          <AuthBrandHeader />
        <Card className="border-border shadow-sm">
          <CardHeader className="text-center">
            <CardTitle className="font-display text-2xl font-semibold tracking-tight">Reset password</CardTitle>
            <CardDescription>
              {sent
                ? "If an account exists for that email, a reset link is on its way."
                : "Enter your email and we'll send a reset link."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {!sent ? (
              <form onSubmit={onSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                    <Input
                      id="email"
                      type="email"
                      placeholder="you@company.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="pl-10"
                      required
                      autoComplete="email"
                      disabled={loading}
                    />
                  </div>
                </div>
                <Button type="submit" className="w-full" size="lg" loading={loading}>
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Send reset link"}
                </Button>
              </form>
            ) : (
              <div className="space-y-4">
                {devResetUrl && (
                  <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm">
                    <p className="font-medium text-amber-700 dark:text-amber-400 mb-1">
                      Dev mode — SMTP not configured
                    </p>
                    <Link
                      href={devResetUrl}
                      className="text-primary hover:underline break-all"
                    >
                      Open reset link
                    </Link>
                  </div>
                )}
                <Button asChild className="w-full" size="lg">
                  <Link href="/login">Back to sign in</Link>
                </Button>
              </div>
            )}
            {!sent && (
              <p className="text-center text-sm text-muted-foreground">
                <Link href="/login" className="text-primary hover:underline">
                  Back to sign in
                </Link>
              </p>
            )}
          </CardContent>
        </Card>
        </div>
      </main>
    </div>
  );
}
