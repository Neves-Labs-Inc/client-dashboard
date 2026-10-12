import { describe, expect, it } from "vitest";
import { links } from "@/root";

describe("root links", () => {
  it("declares the SVG favicon", () => {
    expect(links()).toContainEqual({
      rel: "icon",
      href: "/favicon.svg",
      type: "image/svg+xml",
    });
  });

  it("declares the apple touch icon", () => {
    expect(links()).toContainEqual({
      rel: "apple-touch-icon",
      href: "/apple-touch-icon.png",
    });
  });

  it("keeps the two font preloads", () => {
    const preloads = links().filter(
      (link) => "rel" in link && link.rel === "preload",
    );
    expect(preloads).toHaveLength(2);
  });
});
