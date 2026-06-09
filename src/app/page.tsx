import Link from "next/link";

export default function HomePage() {
  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-8 px-6 py-16">
      <div className="space-y-4">
        <p className="text-sm font-medium uppercase tracking-widest text-accent">
          GRC Intelligence
        </p>
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
          Regulatory compliance assessments powered by your corpus
        </h1>
        <p className="text-lg text-muted">
          Norvar maps deployments against privacy, AI, and cybersecurity frameworks —
          with grounded citations from your regulatory knowledge base.
        </p>
      </div>
      <Link
        href="/assess"
        className="inline-flex items-center justify-center rounded-lg bg-accent px-5 py-3 text-sm font-medium text-white transition hover:bg-accent-hover"
      >
        Start assessment
      </Link>
    </main>
  );
}
