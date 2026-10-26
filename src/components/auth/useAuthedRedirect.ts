"use client";

import { useEffect } from "react";
import { useSession } from "next-auth/react";
import { useSearchParams } from "next/navigation";

export function useAuthedRedirect() {
  const { data: session, status } = useSession();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (status === "authenticated" && session?.user) {
      if (searchParams.get("switch") === "true") return;

      const callbackUrl = searchParams.get("callbackUrl");
      const isClient = session.user.role === "client";
      const defaultTarget = isClient ? "/client/tickets" : "/dashboard/overview";
      const target =
        callbackUrl && callbackUrl.startsWith("/") && callbackUrl !== "/login"
          ? callbackUrl
          : defaultTarget;

      window.location.replace(target);
    }
  }, [status, session, searchParams]);
}
