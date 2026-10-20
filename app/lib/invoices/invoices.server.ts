import { db } from "@/lib/db/db.server";
import { createInvoices, type Invoices } from "@/lib/invoices/invoices";

// The app's one Invoices module. Server-only: it holds the Db.
export const invoices: Invoices = createInvoices({ db });
