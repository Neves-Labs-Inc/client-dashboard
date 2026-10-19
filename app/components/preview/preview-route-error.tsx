import { ArrowLeft } from "lucide-react";
import { Link } from "react-router";
import { CLIENTS_CRUMB } from "@/components/admin/client-workspace-header";
import { buttonStyles } from "@/components/ui/button-styles";
import PageHeader from "@/components/ui/page-header";
import PanelError from "@/components/ui/panel-error";
import { cn } from "@/lib/utils";

type PreviewRouteErrorProps = {
  // An unknown or malformed Client id.
  isNotFound: boolean;
};

// The preview layout's error page. No shell: without a Client there is
// nothing to brand it with. A 404 says nothing about the id beyond "not
// found"; anything else is the generic error, its "Try again" revalidating.
export default function PreviewRouteError({
  isNotFound,
}: PreviewRouteErrorProps): React.ReactNode {
  return (
    <main id="main" className="min-w-0 p-3 md:px-5 md:py-4">
      <div className="flex max-w-2xl flex-col gap-4">
        {isNotFound ? (
          <>
            <PageHeader
              breadcrumb={[CLIENTS_CRUMB, { label: "Not found" }]}
              title="Client not found"
            />
            <div>
              <Link
                to={CLIENTS_CRUMB.href}
                className={cn(
                  buttonStyles({ variant: "secondary" }),
                  "h-11 px-4 text-sm md:h-8 md:px-2.5 md:text-[13px] pointer-coarse:h-11 pointer-coarse:px-4",
                )}
              >
                <ArrowLeft size={14} aria-hidden="true" />
                Back to Clients
              </Link>
            </div>
          </>
        ) : (
          <>
            <PageHeader
              breadcrumb={[CLIENTS_CRUMB, { label: "Preview" }]}
              title="Preview"
            />
            <div className="rounded-[3px] border border-line bg-surface">
              <PanelError message="Couldn't load this page." />
            </div>
          </>
        )}
      </div>
    </main>
  );
}
