"use client";

import { useTheme } from "next-themes";
import { Moon, Sun } from "lucide-react";
import { useIsClient } from "@/lib/clientHooks";

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();

  // Until we're on the client we don't know the resolved theme — render a
  // stable placeholder so server and client markup match.
  const isDark = useIsClient() && resolvedTheme === "dark";

  return (
    <button
      type="button"
      aria-label="Toggle color theme"
      onClick={() => setTheme(isDark ? "light" : "dark")}
      className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-surface text-muted transition hover:text-primary hover:border-primary/40 hover:bg-primary-soft/50 active:scale-95"
    >
      {isDark ? <Sun size={17} /> : <Moon size={17} />}
    </button>
  );
}
