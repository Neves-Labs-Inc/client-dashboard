import { cn } from "@/lib/utils";

type CenteredMessageProps = {
  title: string;
  detail: string;
  children?: React.ReactNode;
};

// Full-page centered h1 + one line, shared by the placeholder and the error
// states. Not a design-system component; the shell will replace it.
export default function CenteredMessage({
  title,
  detail,
  children,
}: CenteredMessageProps): React.ReactNode {
  return (
    <main
      className={cn(
        "grid min-h-dvh place-items-center p-3 md:px-5 md:py-4",
        // Pack extra rows in the middle instead of splitting the height.
        Boolean(children) && "content-center",
      )}
    >
      <div className="flex max-w-sm flex-col items-center gap-1 text-center">
        <h1 className="text-lg/6 font-semibold text-fg">{title}</h1>
        <p className="text-sm/5 text-balance text-fg-2">{detail}</p>
      </div>
      {children}
    </main>
  );
}
