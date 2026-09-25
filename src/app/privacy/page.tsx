import Link from "next/link";

export default function Privacy() {
  return <main className="privacy"><Link href="/" className="brand">mable<span>.</span></Link><h1>Privacy</h1>
    <p>Mable uses your Google account to identify you and, with your permission, read and modify Gmail messages. It reads inbox messages to answer your questions and can apply labels, star, mark read, or archive according to your rules.</p>
    <p>For each evaluation, Mable sends the message sender, recipients, subject, date, account email, and up to 20,000 characters of normalized body text to TypeSafe AI, either directly or through Vercel AI Gateway depending on your selected provider, using the API key you provide. Attachments are not sent. Review <a href="https://typesafe.ai/legal/privacy-policy">TypeSafe’s privacy policy</a> and, when using AI Gateway, <a href="https://vercel.com/legal/privacy-policy">Vercel’s privacy policy</a> before connecting.</p>
    <p>Mable stores your account, encrypted Google and AI provider credentials, rules, settings, Gmail history checkpoints, message IDs, evaluation scores, selected actions, and run progress in PostgreSQL. Run review loads email previews from Gmail on demand. It does not store message bodies, subjects, or attachments. Your data is used only to provide the cleanup you configure and is not used to train Mable’s own models.</p>
    <p>You can remove your AI provider key in Settings. Deleting your account stops scheduled work and deletes Mable’s saved data. Mable also asks Google to revoke its access when possible. You can revoke access directly in your Google account at any time.</p>
    <p>This open-source project is intended for self-hosting and test deployments while public Google OAuth verification is pending. A public deployment must publish its own operator contact and any additional retention or hosting details before accepting users.</p>
    <Link href="/">Back to mable</Link>
  </main>;
}
