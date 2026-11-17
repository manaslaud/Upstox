import { getServerSession } from "next-auth";
import {
  authOptions,
  isAllowedEmail,
  isAuthBypassEnabled,
} from "../auth";
import Scanner from "./scanner";
import SignIn from "./sign-in";

export const dynamic = "force-dynamic";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ error?: string | string[] }>;
}) {
  if (isAuthBypassEnabled()) {
    return <Scanner email="Development bypass" authBypassed />;
  }

  const session = await getServerSession(authOptions);
  if (!session || !isAllowedEmail(session.user?.email)) {
    const params = await searchParams;
    return (
      <SignIn
        accessDenied={Boolean(session) || params.error === "AccessDenied"}
      />
    );
  }

  return <Scanner email={session.user?.email ?? "Google account"} />;
}
