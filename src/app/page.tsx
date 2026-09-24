import { headers } from "next/headers";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { MableApp } from "@/components/app";
import { SignIn } from "@/components/sign-in";

export const dynamic = "force-dynamic";

export default async function Home() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (session) return <MableApp email={session.user.email} />;
  return <main className="welcome"><div className="brand">mable<span>.</span></div><div className="welcome-body"><div className="eyebrow">A QUIETER INBOX</div><h1>Let good questions do the sorting.</h1><p>Write a question. Choose an action. Mable uses Jev to clean up your Gmail inbox, one message at a time.</p><SignIn/></div><footer>Open source · Your TypeSafe key · Your Gmail · <Link href="/privacy">Privacy</Link></footer></main>;
}
