import { describe, expect, it } from "vitest";
import { isMapDrawerClose, isMapDrawerToggle } from "@/lib/projects";

function urls(current: string, next: string) {
  return {
    currentUrl: new URL(current, "http://localhost"),
    nextUrl: new URL(next, "http://localhost"),
  };
}

describe("isMapDrawerToggle", () => {
  it("is true when only the map param opens, closes or changes", () => {
    expect(isMapDrawerToggle(urls("/p", "/p?map=a"))).toBe(true);
    expect(isMapDrawerToggle(urls("/p?map=a", "/p"))).toBe(true);
    expect(isMapDrawerToggle(urls("/p?map=a", "/p?map=b"))).toBe(true);
  });

  it("is false for the same URL, another path or another param", () => {
    expect(isMapDrawerToggle(urls("/p?map=a", "/p?map=a"))).toBe(false);
    expect(isMapDrawerToggle(urls("/p", "/q?map=a"))).toBe(false);
    expect(isMapDrawerToggle(urls("/p?x=1", "/p?x=2&map=a"))).toBe(false);
  });
});

describe("isMapDrawerClose", () => {
  it("is true only when the map param is dropped", () => {
    expect(isMapDrawerClose(urls("/p?map=a", "/p"))).toBe(true);
  });

  it("is false when the drawer opens or switches Project", () => {
    expect(isMapDrawerClose(urls("/p", "/p?map=a"))).toBe(false);
    expect(isMapDrawerClose(urls("/p?map=a", "/p?map=b"))).toBe(false);
  });
});
