// CSRF guard for the app's own form actions (React Router has none):
// whether the request came from a page on `origin`. Browsers send Origin on
// every POST; Referer covers the rare one that strips it. Neither means no.
export function isSameOrigin(request: Request, origin: string): boolean {
  const originHeader = request.headers.get("origin");
  const referer = request.headers.get("referer");

  let requestOrigin: string | null = null;
  if (originHeader !== null) {
    requestOrigin = originHeader;
  } else if (referer !== null && URL.canParse(referer)) {
    requestOrigin = new URL(referer).origin;
  }
  return requestOrigin === origin;
}
