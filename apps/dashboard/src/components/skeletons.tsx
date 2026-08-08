import { Card } from "#/components/ui/card";
import { cn } from "#/lib/utils";

// These mirror the real layout's geometry so nothing jumps when data lands.

export function SkeletonLine({ className }: { className?: string }) {
  return <span className={cn("skeleton block h-3", className)} />;
}

export function SkeletonPageHeader() {
  return (
    <div className="flex flex-col gap-2 pb-5">
      <SkeletonLine className="h-4 w-48" />
      <SkeletonLine className="w-72" />
    </div>
  );
}

export function SkeletonStats() {
  return (
    <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
      {[0, 1, 2, 3].map((i) => (
        <div
          key={i}
          className="flex flex-col gap-2 rounded-panel border border-border bg-surface px-3.5 py-3"
        >
          <SkeletonLine className="h-2.5 w-20" />
          <SkeletonLine className="h-4 w-14" />
        </div>
      ))}
    </div>
  );
}

export function SkeletonRows({ rows = 5 }: { rows?: number }) {
  return (
    <Card>
      <ul className="divide-y divide-border">
        {Array.from({ length: rows }, (_, i) => (
          <li key={i} className="flex items-center gap-3 px-3 py-3">
            <span className="skeleton size-7 shrink-0 rounded-control" />
            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
              <SkeletonLine className="w-32" />
              <SkeletonLine className={i % 2 === 0 ? "w-64" : "w-48"} />
            </div>
            <span className="skeleton h-5 w-9 shrink-0 rounded-full" />
          </li>
        ))}
      </ul>
    </Card>
  );
}
