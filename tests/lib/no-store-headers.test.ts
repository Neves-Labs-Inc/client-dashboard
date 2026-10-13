import { describe, expect, it } from "vitest";
import { getNoStoreHeaders } from "@/lib/no-store-headers";

const COOKIE = "better-auth.session_token=renewed; Path=/; HttpOnly";

function headersWith(...cookies: string[]): Headers {
  const headers = new Headers();
  for (const cookie of cookies) headers.append("set-cookie", cookie);
  return headers;
}

describe("getNoStoreHeaders", () => {
  it("forbids caching and keeps the session cookie", () => {
    const headers = getNoStoreHeaders({
      loaderHeaders: headersWith(COOKIE),
      parentHeaders: new Headers(),
    });

    expect(headers.get("cache-control")).toBe("private, no-store");
    expect(headers.getSetCookie()).toEqual([COOKIE]);
  });

  it("sends a cookie once when parent and child loaders both set it", () => {
    const headers = getNoStoreHeaders({
      loaderHeaders: headersWith(COOKIE),
      parentHeaders: headersWith(COOKIE),
    });

    expect(headers.getSetCookie()).toEqual([COOKIE]);
  });
});
