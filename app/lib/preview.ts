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

// "Preview · Overview · Acme · Neves Labs"; the Client is left out when its
// name isn't known (an error page).
export function getPreviewTitle(page: string, clientName?: string): string {
  const parts = ["Preview", page, clientName, "Neves Labs"];
  return parts.filter((part) => part !== undefined).join(" · ");
}
