import {
  SkeletonPageHeader,
  SkeletonRows,
  SkeletonStats,
} from "#/components/skeletons";

export default function SystemLoading() {
  return (
    <div className="flex flex-col gap-4" aria-busy role="status" aria-label="Loading">
      <SkeletonPageHeader />
      <SkeletonStats />
      <SkeletonRows rows={3} />
    </div>
  );
}
