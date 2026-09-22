"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

export const ThemeToggle = () => {
  const [mounted, setMounted] = useState(false);
  const { resolvedTheme, setTheme } = useTheme();

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    // Reserve layout, render nothing until hydrated to avoid icon flash.
    return <span aria-hidden className="inline-block size-9" />;
  }

  const isDark = resolvedTheme === "dark";
  const label = isDark ? "Switch to light mode" : "Switch to dark mode";

  return (
    <button
      aria-label={label}
      className="inline-flex size-9 items-center justify-center rounded-full text-marliket-ink-2 transition-colors hover:bg-[rgba(var(--marliket-surface-tint),0.06)] hover:text-marliket-ink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
      onClick={() => setTheme(isDark ? "light" : "dark")}
      title={label}
      type="button"
    >
      {isDark ? (
        <Sun className="size-[18px]" />
      ) : (
        <Moon className="size-[18px]" />
      )}
    </button>
  );
};
