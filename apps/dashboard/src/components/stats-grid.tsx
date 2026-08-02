import { Card } from "#/components/ui/card";

export interface Stat {
  label: string;
  value: string | number;
  emoji: string;
}

/** dashboard.md §7 wireframe: 4-card stats row atop the guild dashboard. */
export function StatsGrid({ stats }: { stats: Stat[] }) {
  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      {stats.map((s) => (
        <Card key={s.label} className="p-4">
          <div className="mb-1 text-xl">{s.emoji}</div>
          <div className="font-brand text-2xl font-bold">{s.value}</div>
          <div className="text-xs text-white/50">{s.label}</div>
        </Card>
      ))}
    </div>
  );
}
