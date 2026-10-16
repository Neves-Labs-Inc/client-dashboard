import Panel from "@/components/ui/panel";
import SummaryRow from "@/components/ui/summary-row";
import SummaryRowSkeleton from "@/components/ui/summary-row-skeleton";
import SummaryTile from "@/components/ui/summary-tile";

const UNAVAILABLE = <span className="text-fg-2">—</span>;
const SUBHEADING_CLASS =
  "mb-2 text-xs/4 font-semibold tracking-[0.06em] text-fg-2 uppercase";

export default function DevSummaryPanel(): React.ReactNode {
  return (
    <Panel id="summary" title="Summary row" meta="Row · tile">
      <div className="flex flex-col gap-4 p-3 text-[13px]/5 text-fg">
        <section aria-labelledby="dev-summary-two">
          <h3 id="dev-summary-two" className={SUBHEADING_CLASS}>
            Two tiles (link + static)
          </h3>
          <SummaryRow label="Two tiles">
            <SummaryTile label="Active projects" value="3" href="/projects" />
            <SummaryTile
              label="On track"
              value="2/3"
              srValue="2 of 3 active Projects"
            />
          </SummaryRow>
        </section>
        <section aria-labelledby="dev-summary-four">
          <h3 id="dev-summary-four" className={SUBHEADING_CLASS}>
            Four tiles
          </h3>
          <SummaryRow label="Four tiles">
            <SummaryTile label="Active projects" value="3" href="/projects" />
            <SummaryTile label="On track" value="2/3" />
            <SummaryTile label="Open invoices" value="1" />
            <SummaryTile label="Open requests" value="4" />
          </SummaryRow>
        </section>
        <section aria-labelledby="dev-summary-unavailable">
          <h3 id="dev-summary-unavailable" className={SUBHEADING_CLASS}>
            Unavailable
          </h3>
          <SummaryRow label="Unavailable">
            <SummaryTile
              label="Active projects"
              value={UNAVAILABLE}
              srValue="unavailable"
              href="/projects"
            />
            <SummaryTile
              label="On track"
              value={UNAVAILABLE}
              srValue="unavailable"
            />
          </SummaryRow>
        </section>
        <section aria-labelledby="dev-summary-skeleton">
          <h3 id="dev-summary-skeleton" className={SUBHEADING_CLASS}>
            Skeleton
          </h3>
          <div className="flex flex-col gap-3">
            <SummaryRowSkeleton count={2} />
            <SummaryRowSkeleton count={4} />
          </div>
        </section>
      </div>
    </Panel>
  );
}
