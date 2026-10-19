import { createContext, useContext } from "react";
import { CLIENT_PATHS, type ClientPaths } from "@/lib/client-paths";

// The paths client pages link through. The client area's by default; the
// preview shell provides the preview's, so every page inside it links there.
export const ClientPathsContext = createContext<ClientPaths>(CLIENT_PATHS);

export function useClientPaths(): ClientPaths {
  return useContext(ClientPathsContext);
}
