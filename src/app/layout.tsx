import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = { title: "mable — a quieter inbox", description: "Simple questions and actions for a cleaner Gmail inbox." };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
