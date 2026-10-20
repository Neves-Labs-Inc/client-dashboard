import { useLocation, useNavigation } from "react-router";
import { isInvoiceDrawerToggle } from "@/lib/admin-invoices";

// Only the path and search matter to the drawer-toggle compare.
const URL_BASE = "http://localhost";

// The search a same-page navigation is loading (a list filter), so the
// page can show the target state at once; null otherwise. Opening or
// closing the New invoice drawer is not a filter switch.
export function useSwitchingSearch(): string | null {
  const navigation = useNavigation();
  const { pathname, search } = useLocation();
  const target = navigation.location;
  const isSwitching =
    navigation.state === "loading" &&
    target !== undefined &&
    target.pathname === pathname &&
    target.search !== search &&
    !isInvoiceDrawerToggle({
      currentUrl: new URL(`${pathname}${search}`, URL_BASE),
      nextUrl: new URL(`${target.pathname}${target.search}`, URL_BASE),
    });
  return isSwitching ? target.search : null;
}
