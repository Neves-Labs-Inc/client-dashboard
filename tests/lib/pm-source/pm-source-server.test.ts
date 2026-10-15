import { describe, expect, it } from "vitest";
import { pmSource } from "@/lib/pm-source/pm-source.server";

describe("pmSource", () => {
  it("is null when the GitHub env is unset, as in tests and CI", () => {
    expect(pmSource).toBeNull();
  });
});
