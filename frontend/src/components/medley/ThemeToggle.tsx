import { useEffect } from "react";
import { Moon, Sun } from "lucide-react";
import { initTheme, toggleTheme, useTheme } from "@/lib/theme";

/**
 * Day or night.
 *
 * One button, not a three-way menu. "Follow my system" is the default and
 * stays the default until the doctor touches this — at which point they have
 * said what they want and a menu asking them to say it again is a decision
 * nobody needs at 2am. The title names the current source of truth so
 * "following your system" is still discoverable without spending a control on
 * it.
 *
 * The icon shows the state you are *in*, not the one you'd switch to. Both
 * conventions exist and both are defensible; showing the current state matches
 * the rest of this rail, where every control reports rather than proposes.
 */
export function ThemeToggle() {
  const { theme, resolved } = useTheme();

  // The inline script in __root.tsx sets the class before first paint; this
  // syncs the store to whatever it decided and starts listening for system
  // changes. Running it here rather than in the store keeps the module free of
  // side effects on import, which SSR would otherwise execute.
  useEffect(() => initTheme(), []);

  const isDark = resolved === "dark";
  const Icon = isDark ? Moon : Sun;

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-pressed={isDark}
      aria-label={isDark ? "Dark theme. Switch to light." : "Light theme. Switch to dark."}
      title={
        theme === "system"
          ? `Following your system (${resolved}). Click to set it yourself.`
          : `${isDark ? "Dark" : "Light"} theme`
      }
      className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-micro text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground max-md:h-9 max-md:w-9 max-md:justify-center max-md:px-0"
    >
      <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
      {/* The word is for the rail, where there is room; on the mobile strip the
          icon carries it and the accessible name does the rest. */}
      <span className="max-md:sr-only">{isDark ? "Night" : "Day"}</span>
    </button>
  );
}
