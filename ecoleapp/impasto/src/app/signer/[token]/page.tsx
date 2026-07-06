import SignerClient from "@/components/SignerClient";

export default async function SignerPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <SignerClient token={token} />;
}
