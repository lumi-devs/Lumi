import Link from "next/link";
import { ArrowLeft, FileQuestion } from "lucide-react";
import { Card } from "#/components/ui/card";
import { EmptyState } from "#/components/ui/empty-state";
import { buttonVariants } from "#/components/ui/button";

export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <Card className="w-full max-w-sm">
        <EmptyState
          icon={FileQuestion}
          title="Page not found"
          description="This page doesn't exist, or your account doesn't have access to it."
          action={
            <Link
              href="/"
              className={buttonVariants({ variant: "secondary", size: "md" })}
            >
              <ArrowLeft aria-hidden />
              Back to Lumi
            </Link>
          }
        />
      </Card>
    </main>
  );
}
