// The `headers` export for pages behind the session: the browser and shared
// caches must not keep them. The session's Set-Cookie headers (a slid session)
// are carried over here, once each when parent and child loaders both set them.
export function getNoStoreHeaders({
  loaderHeaders,
  parentHeaders,
}: {
  loaderHeaders: Headers;
  parentHeaders: Headers;
}): Headers {
  const headers = new Headers(parentHeaders);
  const known = new Set(headers.getSetCookie());
  for (const cookie of loaderHeaders.getSetCookie()) {
    if (known.has(cookie)) continue;
    headers.append("set-cookie", cookie);
  }
  headers.set("cache-control", "private, no-store");
  return headers;
}
