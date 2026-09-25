import { headers } from "next/headers";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { MableApp } from "@/components/app";
import { SignIn } from "@/components/sign-in";

export const dynamic = "force-dynamic";

export default async function Home() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (session) return <MableApp email={session.user.email} />;
  return <main className="welcome"><div className="brand">mable<span>.</span></div><div className="welcome-body"><h1>Let good questions do the sorting.</h1><p>Write a question. Choose an action. Mable cleans up your Gmail inbox.</p><SignIn/></div><footer className="welcome-footer">
    <a href="https://github.com/arminayat/mable"><svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 .75a11.25 11.25 0 0 0-3.558 21.923c.563.104.768-.244.768-.542 0-.267-.01-.975-.015-1.914-3.13.68-3.791-1.508-3.791-1.508-.512-1.3-1.25-1.646-1.25-1.646-1.022-.699.077-.685.077-.685 1.13.08 1.724 1.16 1.724 1.16 1.004 1.72 2.633 1.223 3.274.935.102-.727.393-1.223.715-1.504-2.499-.284-5.126-1.25-5.126-5.566 0-1.23.44-2.233 1.16-3.02-.116-.285-.503-1.43.11-2.98 0 0 .945-.303 3.094 1.154A10.79 10.79 0 0 1 12 6.178c.956.004 1.919.13 2.818.379 2.148-1.457 3.091-1.154 3.091-1.154.615 1.55.228 2.695.112 2.98.722.787 1.159 1.79 1.159 3.02 0 4.327-2.631 5.279-5.138 5.558.404.35.766 1.043.766 2.1 0 1.516-.014 2.738-.014 3.11 0 .3.203.65.774.54A11.25 11.25 0 0 0 12 .75Z"/></svg> Source</a>
    <Link href="/privacy">Privacy</Link>
    <a href="https://aayat.me">With love from Berlin</a>
  </footer></main>;
}
