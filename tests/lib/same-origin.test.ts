import { describe, expect, it } from "vitest";
import { isSameOrigin } from "@/lib/same-origin";

const ORIGIN = "https://portal.example.com";

function post(headers: Record<string, string>): Request {
  return new Request(`${ORIGIN}/sign-out`, { method: "POST", headers });
}

describe("isSameOrigin", () => {
  it("accepts a request whose Origin is the portal's", () => {
    expect(isSameOrigin(post({ origin: ORIGIN }), ORIGIN)).toBe(true);
  });

  it("rejects another origin, even a sibling subdomain", () => {
    const request = post({ origin: "https://www.example.com" });
    expect(isSameOrigin(request, ORIGIN)).toBe(false);
  });

  it("rejects the opaque null Origin", () => {
    expect(isSameOrigin(post({ origin: "null" }), ORIGIN)).toBe(false);
  });

  it("falls back to the Referer's origin when Origin is missing", () => {
    const same = post({ referer: `${ORIGIN}/passkey?x=1` });
    const other = post({ referer: "https://evil.example/page" });
    expect(isSameOrigin(same, ORIGIN)).toBe(true);
    expect(isSameOrigin(other, ORIGIN)).toBe(false);
  });

  it("rejects a request with neither header, or an unparsable Referer", () => {
    expect(isSameOrigin(post({}), ORIGIN)).toBe(false);
    expect(isSameOrigin(post({ referer: "not a url" }), ORIGIN)).toBe(false);
  });

  it("ignores Referer when a mismatched Origin is present", () => {
    const request = post({
      origin: "https://evil.example",
      referer: `${ORIGIN}/passkey`,
    });
    expect(isSameOrigin(request, ORIGIN)).toBe(false);
  });
});
