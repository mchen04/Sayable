import BillingReturnClient from "@/components/BillingReturnClient";

type PageProps = {
  searchParams: Promise<{
    session_id?: string;
    status?: string;
  }>;
};

export default async function BillingReturnPage({ searchParams }: PageProps) {
  const params = await searchParams;
  return <BillingReturnClient sessionId={params.session_id || ""} status={params.status || ""} />;
}
