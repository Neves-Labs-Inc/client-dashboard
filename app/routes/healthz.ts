import { db } from "@/lib/db/db.server";
import { getHealthResponse } from "@/lib/health";

export function loader(): Promise<Response> {
  return getHealthResponse(db);
}
