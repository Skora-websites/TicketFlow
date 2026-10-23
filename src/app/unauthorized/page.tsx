import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ShieldX } from "lucide-react";

export default function UnauthorizedPage() {
  return (
    <div className="dark min-h-screen flex flex-col items-center justify-center bg-background px-4 text-center text-foreground" data-color-theme="purple">
      <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-destructive/10 text-destructive">
        <ShieldX className="h-8 w-8" />
      </div>
      <h1 className="text-2xl font-bold text-foreground">Access Denied</h1>
      <p className="mt-2 max-w-md text-sm text-muted-foreground">
        You don&apos;t have permission to view this page. If you believe this is
        a mistake, contact an administrator.
      </p>
      <div className="mt-6 flex gap-3">
        <Button asChild variant="default">
          <Link href="/">Go Home</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/dashboard/overview">Dashboard</Link>
        </Button>
      </div>
    </div>
  );
}
