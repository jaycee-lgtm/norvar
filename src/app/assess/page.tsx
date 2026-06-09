import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

export default async function AssessPage() {
  const { userId } = await auth();

  if (!userId) {
    redirect("/");
  }

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 px-6 py-16">
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">Assessment</h1>
        <p className="text-muted">
          You are signed in. This route will host Norvar deployment assessments.
        </p>
      </div>
      <div className="rounded-xl border border-border bg-surface p-6 text-sm text-muted">
        Describe a deployment — retail vision analytics, biometric access control, or
        any AI system — and Norvar will evaluate applicable frameworks, gaps, and
        remediation steps.
      </div>
    </main>
  );
}
