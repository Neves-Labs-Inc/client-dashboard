import {
  type ClientProjects,
  createClientProjects,
} from "@/lib/client-projects/client-projects";
import { db } from "@/lib/db/db.server";

// The app's one Client read model. Server-only: it holds the Db.
export const clientProjects: ClientProjects = createClientProjects({ db });
