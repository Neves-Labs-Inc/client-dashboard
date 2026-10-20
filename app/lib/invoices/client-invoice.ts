import type { InvoiceDetail } from "@/lib/invoices/invoices";

// An Invoice as its Client (and the Admin's preview) sees it: without the
// Admin's last status change, which would tell a reverted Paid apart.
export type ClientInvoiceDetail = Omit<InvoiceDetail, "statusChangedAt">;

export function toClientInvoiceDetail(
  detail: InvoiceDetail,
): ClientInvoiceDetail {
  return {
    id: detail.id,
    number: detail.number,
    issueDate: detail.issueDate,
    dueDate: detail.dueDate,
    totalCents: detail.totalCents,
    status: detail.status,
    memo: detail.memo,
    paidDate: detail.paidDate,
    project: detail.project,
    lineItems: detail.lineItems,
  };
}
