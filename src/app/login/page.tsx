"use client";

import { useState, Suspense } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Checkbox } from "@/components/ui/checkbox";
import { Mail, Lock, Eye, EyeOff, Loader2, TriangleAlert, CircleCheck } from "lucide-react";
import { OAuthButtons } from "@/components/auth/OAuthButtons";
import { AuthBrandPanel, AuthBrandHeader } from "@/components/auth/AuthBrandPanel";
import { useAuthedRedirect } from "@/components/auth/useAuthedRedirect";
import { SignedInPanel } from "@/components/auth/SignedInPanel";

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") || "/dashboard/overview";
  const error = searchParams.get("error");
  const registered = searchParams.get("registered") === "true";
  const verified = searchParams.get("verified");

  // No auto-redirect: devs must be able to reach this form to switch
  // accounts. Signed-in visitors get an explicit banner with actions.
  useAuthedRedirect();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [formError, setFormError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setFormError("");

    if (remember) {
      document.cookie = "rm=1; path=/; max-age=86400; samesite=lax";
    } else {
      document.cookie = "rm=; path=/; max-age=0; samesite=lax";
    }

    try {
      const result = await signIn("credentials", {
        email,
        password,
        redirect: false,
        callbackUrl,
      });

      if (result?.error) {
        setFormError("Invalid email or password");
      } else {
        router.push(callbackUrl);
        router.refresh();
      }
    } catch {
      setFormError("Something went wrong. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen grid lg:grid-cols-2 bg-background">
      <AuthBrandPanel />

      {/* Form panel */}
      <main className="flex items-center justify-center px-4 py-10">
        <div className="w-full max-w-md">
          <AuthBrandHeader />

          <SignedInPanel />

          <Card className="border-border shadow-sm">
            <CardHeader className="text-center">
              <CardTitle className="font-display text-2xl font-semibold tracking-tight">Welcome back</CardTitle>
              <CardDescription>Sign in to your account to continue</CardDescription>
            </CardHeader>

          <CardContent className="space-y-4">
            {verified === "true" && !formError && !error && (
              <Alert className="border-success/20 bg-success-muted">
                <CircleCheck className="h-4 w-4 text-success" aria-hidden />
                <AlertDescription className="text-success">
                  Email verified — sign in to continue.
                </AlertDescription>
              </Alert>
            )}
            {verified === "invalid" && !formError && !error && (
              <Alert variant="destructive" className="border-destructive/20">
                <TriangleAlert className="h-4 w-4" aria-hidden />
                <AlertDescription>
                  That verification link is invalid or has expired. Register again to receive a new one.
                </AlertDescription>
              </Alert>
            )}
            {registered && !formError && !error && verified === null && (
              <Alert className="border-success/20 bg-success-muted">
                <CircleCheck className="h-4 w-4 text-success" aria-hidden />
                <AlertDescription className="text-success">
                  Account created — check your email for a verification link before signing in.
                </AlertDescription>
              </Alert>
            )}
            {(error || formError) && (
              <Alert variant="destructive" className="border-destructive/20">
                <TriangleAlert className="h-4 w-4" aria-hidden />
                <AlertDescription>
                  {error === "CredentialsSignin" ? "Invalid email or password" : formError || "Authentication failed"}
                </AlertDescription>
              </Alert>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
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
                    disabled={isLoading}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password">Password</Label>
                  <Link href="/forgot-password" className="text-sm text-primary hover:underline">
                    Forgot password?
                  </Link>
                </div>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="pl-10 pr-10"
                    required
                    autoComplete="current-password"
                    disabled={isLoading}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-2 top-1/2 -translate-y-1/2"
                    onClick={() => setShowPassword(!showPassword)}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                  </Button>
                </div>
              </div>

              <div className="flex items-center justify-between">
                <Label className="flex items-center gap-2 cursor-pointer">
                  <Checkbox
                    checked={remember}
                    onCheckedChange={(checked: boolean) => setRemember(checked)}
                  />
                  <span className="text-sm text-muted-foreground">Remember me</span>
                </Label>
              </div>

              <Button type="submit" className="w-full" size="lg" loading={isLoading}>
                {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Sign In"}
              </Button>
            </form>

            <OAuthButtons callbackUrl={callbackUrl} />
          </CardContent>

          <CardFooter className="flex flex-col items-center gap-4">
            <p className="text-sm text-muted-foreground">
              Don&apos;t have an account?{" "}
              <Link href="/signup" className="font-medium text-primary hover:underline">
                Sign up
              </Link>
            </p>
          </CardFooter>
        </Card>
        </div>
      </main>
    </div>
  );
}