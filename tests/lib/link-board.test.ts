import { describe, expect, it } from "vitest";
import {
  isLinkDrawerToggle,
  parseMapping,
  parseOptions,
} from "@/lib/link-board";

function toggle(current: string, next: string): boolean {
  return isLinkDrawerToggle({
    currentUrl: new URL(current, "http://localhost"),
    nextUrl: new URL(next, "http://localhost"),
  });
}

describe("isLinkDrawerToggle", () => {
  it("is true when only the link param opens, closes or changes", () => {
    expect(toggle("/admin", "/admin?link=PVT_1")).toBe(true);
    expect(toggle("/admin?link=PVT_1", "/admin")).toBe(true);
    expect(toggle("/admin?link=PVT_1", "/admin?link=PVT_2")).toBe(true);
    expect(toggle("/admin?a=1&link=PVT_1", "/admin?a=1")).toBe(true);
  });

  it("is false for the same URL, another path or another param", () => {
    expect(toggle("/admin?link=PVT_1", "/admin?link=PVT_1")).toBe(false);
    expect(toggle("/admin", "/admin/clients/x/projects?link=PVT_1")).toBe(
      false,
    );
    expect(toggle("/admin", "/admin?new=client")).toBe(false);
    expect(toggle("/admin?a=1", "/admin?a=2&link=PVT_1")).toBe(false);
  });
});

describe("parseOptions", () => {
  it("reads the posted options, an empty list included", () => {
    expect(parseOptions('[{"id":"opt_1","name":"Todo","extra":1}]')).toEqual([
      { id: "opt_1", name: "Todo" },
    ]);
    expect(parseOptions("[]")).toEqual([]);
  });

  it("is null when the field is missing, malformed or out of bounds", () => {
    const tooMany = JSON.stringify(
      Array.from({ length: 101 }, (_, index) => ({
        id: `opt_${index}`,
        name: "x",
      })),
    );
    const tooLong = JSON.stringify([{ id: "opt_1", name: "x".repeat(257) }]);

    expect(parseOptions(null)).toBeNull();
    expect(parseOptions("{not json")).toBeNull();
    expect(parseOptions('[{"id":"","name":"Todo"}]')).toBeNull();
    expect(parseOptions('{"id":"opt_1","name":"Todo"}')).toBeNull();
    expect(parseOptions(tooMany)).toBeNull();
    expect(parseOptions(tooLong)).toBeNull();
  });
});

describe("parseMapping", () => {
  it("maps each mapping field to its client status, or Unmapped for an empty one", () => {
    const form = new FormData();
    form.set("intent", "link");
    form.set("mapping.opt_1", "DONE");
    form.set("mapping.opt_2", "");

    expect(parseMapping(form)).toEqual({ opt_1: "DONE", opt_2: null });
    expect(parseMapping(null)).toEqual({});
  });

  it("is null when any field is not a client status or empty", () => {
    const form = new FormData();
    form.set("mapping.opt_1", "DONE");
    form.set("mapping.opt_2", "SHIPPED");

    expect(parseMapping(form)).toBeNull();
  });
});
