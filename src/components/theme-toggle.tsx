"use client";

import { useEffect } from "react";
import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ThemeToggle() {
  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const followSystem = () => {
      try {
        if (localStorage.getItem("birthday-world-theme")) return;
      } catch {}
      document.documentElement.classList.toggle("dark", media.matches);
    };
    media.addEventListener("change", followSystem);
    return () => media.removeEventListener("change", followSystem);
  }, []);

  return (
    <Button
      variant="ghost"
      size="icon"
      className="theme-toggle"
      aria-label="테마 전환"
      title="밝은 테마 / 어두운 테마 전환"
      onClick={() => {
        const dark = document.documentElement.classList.toggle("dark");
        try {
          localStorage.setItem("birthday-world-theme", dark ? "dark" : "light");
        } catch {}
      }}
    >
      <Moon className="theme-moon" />
      <Sun className="theme-sun" />
    </Button>
  );
}
