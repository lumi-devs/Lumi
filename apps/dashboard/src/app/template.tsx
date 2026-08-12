/** Re-mounts on every navigation, so the `.rise` entrance plays on each route change. */
export default function RootTemplate({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div className="rise">{children}</div>;
}
