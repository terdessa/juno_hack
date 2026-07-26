import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-2xl tracking-tight">This page doesn't exist</h1>
        <p className="mt-2 text-body text-muted-foreground">
          The link may be out of date. Nothing has been lost — every follow-up is still on your
          list.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-xl bg-primary px-4 py-2.5 text-body font-medium text-primary-foreground transition-opacity hover:opacity-90"
          >
            Go to Medley
          </Link>
          <Link
            to="/calls"
            className="inline-flex items-center justify-center rounded-xl border border-input px-4 py-2.5 text-body font-medium text-foreground transition-colors hover:bg-secondary"
          >
            See all calls
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-2xl tracking-tight">This page didn't load</h1>
        <p className="mt-2 text-body text-muted-foreground">
          Something broke on our side, not yours. Nothing was saved and no patient has been called.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-xl bg-primary px-4 py-2.5 text-body font-medium text-primary-foreground transition-opacity hover:opacity-90"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-xl border border-input px-4 py-2.5 text-body font-medium text-foreground transition-colors hover:bg-secondary"
          >
            Go to Medley
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Medley — AI call agent for GP practices" },
      {
        name: "description",
        content:
          "Medley is an AI voice agent that handles patient follow-ups, rebookings and check-in calls for GPs — freeing up doctors' time.",
      },
      { property: "og:type", content: "website" },
      { property: "og:title", content: "Medley — AI call agent for GP practices" },
      {
        property: "og:description",
        content:
          "Assign a call, Medley phones the patient, brings back a mood-aware summary and books the follow-up.",
      },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      // Without these the h1 — the first thing on screen — visibly reflows once
      // Geist arrives.
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Geist:wght@400;450;500;600;700&display=swap",
      },
      { rel: "icon", href: "/favicon.ico", type: "image/x-icon" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

/**
 * Applies the dark palette from the system preference, before first paint.
 *
 * Runs inline in `<head>`, not in an effect: doing it after hydration means a
 * white flash first, which is worse than no dark mode at all for someone
 * reading this at 2am on a night visit.
 *
 * A stored choice beats the system preference, because a doctor who picked
 * light on a dark laptop meant it. With nothing stored it follows the system,
 * which is what most people want and nobody has to ask for.
 */
const APPLY_THEME = `try{var r=document.documentElement,s=null;
try{s=localStorage.getItem('medley-theme')}catch(e){}
var d=s==='dark'||(s!=='light'&&matchMedia('(prefers-color-scheme: dark)').matches);
r.classList.toggle('dark',d);r.classList.toggle('light',!d);
r.style.colorScheme=d?'dark':'light'}catch(e){}`;

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
        <script dangerouslySetInnerHTML={{ __html: APPLY_THEME }} />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  return (
    <QueryClientProvider client={queryClient}>
      {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
      <Outlet />
    </QueryClientProvider>
  );
}
