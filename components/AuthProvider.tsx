"use client";

import { ReactNode, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export default function AuthProvider({ children }: { children: ReactNode }) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return <>{children}</>;
  }

  return <>{children}</>;
}
