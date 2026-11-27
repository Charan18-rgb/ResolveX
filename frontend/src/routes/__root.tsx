import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createRootRouteWithContext,
  HeadContent,
  Link,
  Outlet,
  Scripts,
  useRouter,
  type ErrorComponentProps,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";
import { UnifiedAppShell } from "@/components/layout/UnifiedAppShell";
import { ResolveXProvider } from "@/context/ResolveXContext";
import { reportLovableError } from "@/lib/lovable-error-reporting";
import appCss from "../styles.css?url";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#050814] px-4 text-slate-100">
      <div className="max-w-md text-center space-y-4">
        <h1 className="text-7xl font-bold text-white">404</h1>
        <h2 className="text-xl font-semibold text-white">Page not found</h2>
        <p className="text-sm text-slate-400">
          The page you are looking for does not exist or has been moved.
        </p>
        <div>
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-xl bg-gradient-to-r from-violet-600 to-cyan-500 px-4 py-2 text-sm font-medium text-white"
          >
            Return to ResolveX Home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: ErrorComponentProps) {
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#050814] px-4 text-slate-100">
      <div className="max-w-md text-center space-y-4">
        <h1 className="text-xl font-semibold text-white">This page did not load</h1>
        <p className="text-sm text-slate-400">
          Something went wrong while rendering this route. You can retry or return home.
        </p>
        <div className="flex flex-wrap justify-center gap-2">
          <button
            type="button"
            onClick={() => {
              void router.invalidate();
              reset();
            }}
            className="cursor-pointer rounded-xl bg-gradient-to-r from-violet-600 to-cyan-500 px-4 py-2 text-sm font-medium text-white"
          >
            Try again
          </button>
          <Link
            to="/"
            className="rounded-xl border border-white/15 px-4 py-2 text-sm font-medium text-slate-200 hover:bg-white/5"
          >
            Go home
          </Link>
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
      {
        title: "ResolveX — Natural Language Ambiguity & Inventory Intelligence",
      },
      {
        name: "description",
        content:
          "Understand the Unclear. Resolve the Intent. Unified AI platform for Natural Language Ambiguity Resolution (PS6) and Smart Inventory Intelligence (PS2).",
      },
      {
        property: "og:title",
        content: "ResolveX — Understand the Unclear. Resolve the Intent.",
      },
      { property: "og:type", content: "website" },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
      { rel: "icon", href: "/favicon.ico", type: "image/x-icon" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className="dark">
      <head>
        <HeadContent />
      </head>
      <body className="bg-[#050814] text-slate-100 antialiased selection:bg-violet-500/30 selection:text-cyan-200">
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
      <ResolveXProvider>
        <UnifiedAppShell>
          <Outlet />
        </UnifiedAppShell>
      </ResolveXProvider>
    </QueryClientProvider>
  );
}
