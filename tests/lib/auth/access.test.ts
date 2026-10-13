import { describe, expect, it } from "vitest";
import {
  getAccessHome,
  getAccessRedirect,
  type AccessKind,
} from "@/lib/auth/access";

const SIGN_IN_PAGES: AccessKind[] = ["anonymous"];
const PASSKEY_PAGE: AccessKind[] = ["admin-needs-passkey"];
const ADMIN_PAGES: AccessKind[] = ["admin"];

describe("getAccessRedirect", () => {
  it("lets an allowed access through", () => {
    expect(getAccessRedirect("anonymous", SIGN_IN_PAGES)).toBeNull();
    expect(getAccessRedirect("admin-needs-passkey", PASSKEY_PAGE)).toBeNull();
    expect(getAccessRedirect("admin", ADMIN_PAGES)).toBeNull();
  });

  it("sends anonymous visitors to sign-in", () => {
    expect(getAccessRedirect("anonymous", PASSKEY_PAGE)).toBe("/sign-in");
    expect(getAccessRedirect("anonymous", ADMIN_PAGES)).toBe("/sign-in");
  });

  it("sends a magic-link session to passkey registration", () => {
    expect(getAccessRedirect("admin-needs-passkey", SIGN_IN_PAGES)).toBe(
      "/passkey",
    );
    expect(getAccessRedirect("admin-needs-passkey", ADMIN_PAGES)).toBe(
      "/passkey",
    );
  });

  it("sends a passkey session to the Admin area", () => {
    expect(getAccessRedirect("admin", SIGN_IN_PAGES)).toBe("/admin");
    expect(getAccessRedirect("admin", PASSKEY_PAGE)).toBe("/admin");
  });

  it("sends every access home from /", () => {
    expect(getAccessHome("anonymous")).toBe("/sign-in");
    expect(getAccessHome("admin-needs-passkey")).toBe("/passkey");
    expect(getAccessHome("admin")).toBe("/admin");
    expect(getAccessHome("client")).toBe("/team");
    expect(getAccessHome("invitee")).toBe("/");
    expect(getAccessHome("no-access")).toBe("/no-access");
  });

  it("sends a Client User to Team, and a refused session to No access", () => {
    expect(getAccessRedirect("client", ADMIN_PAGES)).toBe("/team");
    expect(getAccessRedirect("no-access", SIGN_IN_PAGES)).toBe("/no-access");
  });
});
