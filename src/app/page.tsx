import { redirect } from "next/navigation";

type HomeProps = {
  searchParams: Promise<{ id?: string; folder?: string }>;
};

/** Default entry: chat. Legacy assessment deep links keep working via /assess. */
export default async function Home({ searchParams }: HomeProps) {
  const params = await searchParams;

  if (params.id || params.folder) {
    const qs = new URLSearchParams();
    if (params.id) qs.set("id", params.id);
    if (params.folder) qs.set("folder", params.folder);
    redirect(`/assess?${qs.toString()}`);
  }

  redirect("/chat");
}
