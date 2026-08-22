import type { Metadata } from "next";
import { CheckCircle, XCircle } from "lucide-react";
import { Wordmark } from "#/components/layout/wordmark";
import { AppealIntakeForm } from "#/components/appeal/appeal-intake-form";
import { Alert } from "#/components/ui/alert";
import { verifyAppealToken } from "#/lib/dashboard-fetch";
import { APPEAL_STATUS_LABELS, isAppealStatus } from "#/lib/appeals";

export const metadata: Metadata = { title: "Submit an appeal" };

// Public, unauthenticated - reachable by a punished user with no dashboard
// access at all. Deliberately outside `guild/[guildId]/*` so it never runs
// through `requireGuild`/session auth; the signed `token` query param is the
// only thing that authorizes this page, and it is re-verified server-side
// here on load and again by the RPC handler on submit.
export default async function AppealIntakePage({
  params,
  searchParams,
}: {
  params: Promise<{ guildId: string; caseId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { guildId, caseId: caseIdParam } = await params;
  const query = await searchParams;
  const token = single(query["token"]);
  const caseId = Number.parseInt(caseIdParam, 10);

  const invalid = !token || !Number.isInteger(caseId) || caseId < 1;

  let content: React.ReactNode;
  if (invalid) {
    content = <InvalidLink />;
  } else {
    try {
      const result = await verifyAppealToken(guildId, caseId, token);
      content = result.valid ? (
        result.existingStatus !== null ? (
          <AlreadySubmitted status={result.existingStatus} />
        ) : (
          <AppealIntakeForm
            guildId={guildId}
            caseId={caseId}
            token={token}
            caseSummary={result.case}
          />
        )
      ) : (
        <InvalidLink reason={result.reason} />
      );
    } catch {
      content = (
        <Alert variant="warning">
          This link couldn&rsquo;t be verified right now. The bot may be
          offline — try again in a moment.
        </Alert>
      );
    }
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-4 py-10">
      <div className="w-full max-w-md rounded-panel border border-border bg-surface p-6 shadow-e2">
        <Wordmark className="mb-5" />
        {content}
      </div>
    </main>
  );
}

function InvalidLink({ reason }: { reason?: string }) {
  return (
    <>
      <div className="mb-4 flex items-start gap-3">
        <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-control border border-border bg-danger-soft text-danger-fg">
          <XCircle className="size-4" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="font-display text-[19px] font-semibold tracking-[0.01em] text-fg">
            This appeal link doesn&rsquo;t work
          </h1>
          <p className="mt-1 text-[14px] leading-5 text-fg-muted">
            {reason ??
              "The link is malformed, expired, or was already used. Ask the server's staff for a fresh one if you still want to appeal."}
          </p>
        </div>
      </div>
    </>
  );
}

function AlreadySubmitted({ status }: { status: string }) {
  const label = isAppealStatus(status) ? APPEAL_STATUS_LABELS[status] : status;
  return (
    <>
      <div className="mb-4 flex items-start gap-3">
        <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-control border border-border bg-success-soft text-success-fg">
          <CheckCircle className="size-4" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="font-display text-[19px] font-semibold tracking-[0.01em] text-fg">
            Appeal already submitted
          </h1>
          <p className="mt-1 text-[14px] leading-5 text-fg-muted">
            An appeal for this case has already been submitted. Its current
            status is <span className="font-medium text-fg">{label}</span>.
            Submitting again isn&rsquo;t possible for the same case.
          </p>
        </div>
      </div>
    </>
  );
}

function single(value: string | string[] | undefined): string {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw?.trim() ?? "";
}
