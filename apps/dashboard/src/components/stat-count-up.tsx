"use client";

import { useCountUp } from "#/lib/animate";

// Split out from StatsGrid so StatsGrid itself can stay a Server Component -
// icon values (LucideIcon component references) in Stat[] cross the
// server/client boundary as functions otherwise, which React can't
// serialize (crashed every guild page earlier this session for the same
// reason in the top-nav components). This leaf takes only a primitive
// number, which is safe.
export function StatCountUp({ value }: { value: number }) {
  const counted = useCountUp(value);
  return <>{counted.toLocaleString()}</>;
}
