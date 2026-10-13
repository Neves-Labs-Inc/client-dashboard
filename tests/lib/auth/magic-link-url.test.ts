import { describe, expect, it } from "vitest";
import { withSafeRedirects } from "@/lib/auth/magic-link-url";

const BASE_URL = "http://localhost:5173";

function callbackOf(callbackURL: string): string | null {
  const query = new URLSearchParams({ token: "t", callbackURL });
  const url = `${BASE_URL}/api/auth/magic-link/verify?${query}`;
  return new URL(withSafeRedirects(url, BASE_URL)).searchParams.get(
    "callbackURL",
  );
}

describe("withSafeRedirects", () => {
  it("keeps a same-origin path", () => {
    expect(callbackOf("/invitations/abc?x=1")).toBe("/invitations/abc?x=1");
  });

  it("turns a path that resolves to another origin into /", () => {
    for (const path of ["/..//evil.com", "/.//evil.com", "/%2e%2e//evil.com"]) {
      expect(callbackOf(path)).toBe("/");
    }
  });

  it("turns a path whose decoded form leaves the origin into /", () => {
    expect(callbackOf("/%2F%2Fevil.com")).toBe("/");
    expect(callbackOf("/%5Cevil.com")).toBe("/");
  });
});
