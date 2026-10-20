import { describe, expect, it } from "vitest";
import { formatMoney } from "@/lib/money";

describe("formatMoney", () => {
  it("formats cents as US dollars with grouping", () => {
    expect(formatMoney(125050)).toBe("$1,250.50");
    expect(formatMoney(100000000)).toBe("$1,000,000.00");
  });

  it("puts the minus sign before the dollar sign", () => {
    expect(formatMoney(-5000)).toBe("-$50.00");
  });

  it("shows zero as $0.00", () => {
    expect(formatMoney(0)).toBe("$0.00");
  });
});
