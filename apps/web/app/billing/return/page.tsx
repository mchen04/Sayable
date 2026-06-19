import BillingReturnClient from "@/components/BillingReturnClient";

type PageProps = {
  searchParams: Promise<{
    session_id?: string;
    status?: string;
  }>;
};

function checkoutReturnStatus(status?: string): "success" | "cancelled" | undefined {
  return status === "success" || status === "cancelled" ? status : undefined;
}

export default async function BillingReturnPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const returnStatus = checkoutReturnStatus(params.status);
  return <BillingReturnClient sessionId={params.session_id || ""} {...(returnStatus ? { returnStatus } : {})} />;
}
