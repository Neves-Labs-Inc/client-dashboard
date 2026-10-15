import { describe, expect, it } from "vitest";
import { toPlainText } from "@/lib/markdown";

describe("toPlainText", () => {
  it("keeps heading and emphasis text without the markers", () => {
    expect(
      toPlainText("## Week 3\n\nWe **shipped** the _login_ ~~page~~"),
    ).toBe("Week 3 We shipped the login page");
  });

  it("keeps link text and drops the URL", () => {
    expect(toPlainText("Read [the notes](https://example.com/notes).")).toBe(
      "Read the notes.",
    );
  });

  it("turns images into their alt text", () => {
    expect(toPlainText("Before ![the chart](https://x.co/a.png) after")).toBe(
      "Before the chart after",
    );
  });

  it("keeps inline and block code as text", () => {
    expect(
      toPlainText("Run `npm test` then:\n\n```sh\nnpm run\n  build\n```"),
    ).toBe("Run npm test then: npm run build");
  });

  it("collapses lines, lists and tables into single spaces", () => {
    expect(
      toPlainText(
        "  First line\nsecond line\n\n- one\n- two\n\n| A | B |\n| - | - |\n| 1 | 2 |\n  ",
      ),
    ).toBe("First line second line one two A B 1 2");
  });

  it("drops inline HTML tags but keeps the text between them", () => {
    expect(toPlainText("Hi <b>there</b> <span>you</span>")).toBe(
      "Hi there you",
    );
  });

  it("drops an HTML block entirely", () => {
    expect(toPlainText("Hi\n\n<script>alert(1)</script>\n\nthere")).toBe(
      "Hi there",
    );
  });

  it("leaves footnote markers, definitions and backrefs out", () => {
    expect(toPlainText("Note[^1] here\n\n[^1]: The source")).toBe("Note here");
  });

  it("is empty for an empty body", () => {
    expect(toPlainText("")).toBe("");
  });
});
