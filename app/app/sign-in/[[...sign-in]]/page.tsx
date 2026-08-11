import { SignIn } from "@clerk/nextjs";

const sellingPoints = [
  "Workspace-scoped access with live org context.",
  "High-contrast incident review surfaces for operators.",
  "No rollback, no containment, no simulation defaults.",
];

export default function SignInPage() {
  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,#111827_0%,#080D12_44%,#050A0F_100%)] px-4 py-8 text-text-primary">
      <div className="mx-auto grid min-h-[calc(100vh-4rem)] w-full max-w-6xl items-stretch gap-6 lg:grid-cols-[1.05fr_0.95fr] lg:gap-8">
        <section className="flex flex-col justify-between rounded-[28px] border border-border bg-[linear-gradient(180deg,rgba(13,17,23,0.96)_0%,rgba(8,13,18,0.9)_100%)] p-8 shadow-2xl shadow-black/35 lg:p-10">
          <div className="flex flex-col gap-6">
            <div className="inline-flex w-fit items-center rounded-full border border-accent/25 bg-accent/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.24em] text-[#C9D1FF]">
              Secure operator access
            </div>
            <div className="max-w-xl space-y-4">
              <h1 className="text-4xl font-semibold tracking-tight text-[#F0F6FC] sm:text-5xl">
                Sign in to PhishSlayer
              </h1>
              <p className="max-w-lg text-sm leading-7 text-text-sec sm:text-base">
                Resume incident triage, workspace review, and controlled response from a dark, high-contrast control surface built for analysts.
              </p>
            </div>
          </div>

          <div className="mt-8 grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
            {sellingPoints.map((point) => (
              <div
                key={point}
                className="rounded-2xl border border-border-sub bg-bg-base/75 px-4 py-3 text-sm leading-6 text-text-primary shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
              >
                {point}
              </div>
            ))}
          </div>
        </section>

        <section className="flex items-center justify-center rounded-[28px] border border-border bg-bg-surface/95 p-2 shadow-2xl shadow-black/40">
          <div className="w-full max-w-md rounded-[24px] border border-border-sub bg-bg-surface/90 p-2 shadow-[0_0_0_1px_rgba(255,255,255,0.02)]">
            <SignIn signUpUrl="/sign-up" forceRedirectUrl="/onboarding" />
          </div>
        </section>
      </div>
    </main>
  );
}
