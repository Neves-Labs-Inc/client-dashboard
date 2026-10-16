import { db } from "@/lib/db/db.server";
import { createRequests, type Requests } from "@/lib/requests/requests";

// The app's one Requests module. Server-only: it holds the Db.
export const requests: Requests = createRequests({ db });
