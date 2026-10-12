import "@fontsource/ibm-plex-sans/400.css";
import "@fontsource/ibm-plex-sans/500.css";
import "@fontsource/ibm-plex-sans/600.css";
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/500.css";
import "@/styles/app.css";

import plexSans400Href from "@fontsource/ibm-plex-sans/files/ibm-plex-sans-latin-400-normal.woff2?url";
import plexSans600Href from "@fontsource/ibm-plex-sans/files/ibm-plex-sans-latin-600-normal.woff2?url";
import {
  isRouteErrorResponse,
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
} from "react-router";

import CenteredMessage from "@/components/centered-message";
import type { Route } from "./+types/root";

const NOT_FOUND_STATUS = 404;

type ErrorCopy = {
  pageTitle: string;
  title: string;
  detail: string;
};

const NOT_FOUND_COPY: ErrorCopy = {
  pageTitle: "Page not found · Neves Labs",
  title: "Page not found",
  detail: "Check the address and try again.",
};

const GENERIC_ERROR_COPY: ErrorCopy = {
  pageTitle: "Something went wrong · Neves Labs",
  title: "Something went wrong",
  detail: "Try reloading the page.",
};

export function links(): Route.LinkDescriptors {
  // Same URLs the @fontsource CSS points at, so the preloads are reused.
  return [plexSans400Href, plexSans600Href].map((href) => ({
    rel: "preload",
    href,
    as: "font",
    type: "font/woff2",
    crossOrigin: "anonymous",
  }));
}

type LayoutProps = {
  children: React.ReactNode;
};

export function Layout({ children }: LayoutProps): React.ReactNode {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Meta />
        <Links />
      </head>
      <body>
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function App(): React.ReactNode {
  return <Outlet />;
}

export function ErrorBoundary({
  error,
}: Route.ErrorBoundaryProps): React.ReactNode {
  const copy = getErrorCopy(error);
  // Stack traces are for local debugging only; never shipped to visitors.
  const shouldShowStack = import.meta.env.DEV && error instanceof Error;

  return (
    <>
      {/* Rendered here, not via meta: meta misses client-side render errors.
          React 19 hoists it into <head>. */}
      <title>{copy.pageTitle}</title>
      <CenteredMessage title={copy.title} detail={copy.detail}>
        {shouldShowStack && (
          <pre className="mt-4 w-full max-w-2xl min-w-0 overflow-x-auto rounded-[3px] border border-line bg-surface p-3 text-left font-mono text-xs/4 text-fg">
            {/* V8 stacks already start with the message. */}
            {error.stack ?? error.message}
          </pre>
        )}
      </CenteredMessage>
    </>
  );
}

function getErrorCopy(error: unknown): ErrorCopy {
  const isNotFound =
    isRouteErrorResponse(error) && error.status === NOT_FOUND_STATUS;
  return isNotFound ? NOT_FOUND_COPY : GENERIC_ERROR_COPY;
}
