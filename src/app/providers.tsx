"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import AccountSyncProvider from "@/components/sync/AccountSyncProvider";
import AuthProvider from "@/components/auth/AuthProvider";

export default function Providers({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  if (pathname === "/custom") return <>{children}</>;
  return <AuthProvider><AccountSyncProvider>{children}</AccountSyncProvider></AuthProvider>;
}
