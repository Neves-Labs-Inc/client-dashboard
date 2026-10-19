import { useLocation, useNavigation } from "react-router";

// The path a client-side navigation is loading, or null when no other page
// is: a layout shows that page's skeleton meanwhile.
export function useNavigatingToPath(): string | null {
  const navigation = useNavigation();
  const { pathname } = useLocation();
  const target = navigation.location;
  const isChangingPage =
    navigation.state === "loading" &&
    target !== undefined &&
    target.pathname !== pathname;
  return isChangingPage ? target.pathname : null;
}
