import { useLocation, useNavigation } from "react-router";

// The search a same-page navigation is loading (a list filter), so the
// page can show the target state at once; null otherwise.
export function useSwitchingSearch(): string | null {
  const navigation = useNavigation();
  const { pathname, search } = useLocation();
  const target = navigation.location;
  const isSwitching =
    navigation.state === "loading" &&
    target !== undefined &&
    target.pathname === pathname &&
    target.search !== search;
  return isSwitching ? target.search : null;
}
