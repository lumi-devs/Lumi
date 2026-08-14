"use client";

import { useCountUp } from "#/lib/animate";

// Split out from StatsGrid so StatsGrid itself can stay a Server Component -
// icon values (LucideIcon component references) in Stat[] would otherwise
// cross the server/client boundary as functions, which React can't serialize.
// This leaf takes only a primitive number, which is safe.
export function StatCountUp({ value }: { value: number }) {
  const counted = useCountUp(value);
  return <>{counted.toLocaleString()}</>;
}
