// The Admin's read-only preview of a Client's pages, as its Owner sees them.

// The preview layout's route id, for pages reading its data
// (useRouteLoaderData).
export const PREVIEW_LAYOUT_ROUTE_ID = "routes/preview/layout";

// The Client a preview is of, from the URL's id.
export type PreviewClient = {
  clientId: string;
  clientName: string;
  isArchived: boolean;
};

// The Client's name from the preview layout's match, for an error page's
// title; undefined when the layout didn't load (its own 404 or failure).
export function getLayoutClientName(
  matches: readonly ({ id: string; data?: unknown } | undefined)[],
): string | undefined {
  const layout = matches.find((match) => match?.id === PREVIEW_LAYOUT_ROUTE_ID);
  const data = layout?.data as { clientName?: unknown } | undefined;
  return typeof data?.clientName === "string" ? data.clientName : undefined;
}

// "Preview · Overview · Acme · Neves Labs"; the Client is left out when its
// name isn't known (an error page).
export function getPreviewTitle(page: string, clientName?: string): string {
  const parts = ["Preview", page, clientName, "Neves Labs"];
  return parts.filter((part) => part !== undefined).join(" · ");
}
