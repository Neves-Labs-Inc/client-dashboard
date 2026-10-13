type SkeletonGroupProps = {
  label: string;
  children: React.ReactNode;
};

export default function SkeletonGroup({
  label,
  children,
}: SkeletonGroupProps): React.ReactNode {
  return (
    <div aria-busy="true">
      <span className="sr-only">Loading {label}</span>
      {/* The 150ms delay keeps the skeleton from flashing on fast loads. */}
      <div
        aria-hidden="true"
        className="animate-in delay-150 duration-(--dur-base) ease-out fade-in-0 fill-mode-both"
      >
        {children}
      </div>
    </div>
  );
}
