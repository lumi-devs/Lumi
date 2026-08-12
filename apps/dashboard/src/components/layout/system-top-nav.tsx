import { TopNav } from "#/components/layout/top-nav";
import { systemTopLinks } from "#/lib/system-nav";

export function SystemTopNav() {
  return <TopNav directLinks={systemTopLinks()} />;
}
