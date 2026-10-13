type MenuHeaderProps = {
  children: React.ReactNode;
};

export default function MenuHeader({
  children,
}: MenuHeaderProps): React.ReactNode {
  return (
    <div className="-mx-1.5 -mt-1.5 mb-1.5 border-b border-line px-2.5 py-2">
      {children}
    </div>
  );
}
