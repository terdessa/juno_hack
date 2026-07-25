/**
 * The mark.
 *
 * Three bars of increasing height on a shared baseline — a list of follow-ups,
 * and a signal rising. Geometric, monochrome, no letterform, and legible at
 * 16px in a favicon, which a letter in a rounded square is not.
 */
export function Mark({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      aria-hidden
      className={className}
      focusable="false"
    >
      <rect x="2" y="12" width="3.6" height="6" rx="1.2" fill="currentColor" opacity="0.45" />
      <rect x="8.2" y="7.5" width="3.6" height="10.5" rx="1.2" fill="currentColor" opacity="0.72" />
      <rect x="14.4" y="2" width="3.6" height="16" rx="1.2" fill="currentColor" />
    </svg>
  );
}
