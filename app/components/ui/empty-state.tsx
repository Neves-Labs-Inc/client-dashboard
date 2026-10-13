type EmptyStateProps = {
  children: React.ReactNode;
  icon?: React.ReactNode;
  action?: React.ReactNode;
};

export default function EmptyState({
  children,
  icon,
  action,
}: EmptyStateProps): React.ReactNode {
  return (
    <div className="px-3 py-6 text-[13px]/5 text-fg-2">
      <div className="flex items-start gap-1.5">
        {icon}
        <p>{children}</p>
      </div>
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}
