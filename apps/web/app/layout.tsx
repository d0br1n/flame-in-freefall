import type { Metadata } from "next";
import { Bricolage_Grotesque, Figtree, Geist_Mono, Space_Grotesk } from "next/font/google";
import type { ReactNode } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { AssistantProvider } from "@/components/assistant/AssistantProvider";
import { SITE_NAME, SITE_TAGLINE } from "@/lib/site";
import { THEME_SCRIPT } from "@/lib/theme";
import "./globals.css";

// Interface text.
const figtree = Figtree({ variable: "--font-figtree", subsets: ["latin"] });
// Headings and big numbers.
const bricolage = Bricolage_Grotesque({ variable: "--font-bricolage", subsets: ["latin"] });
// PSI IDs, test IDs and numbers in tables.
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });
// The wordmark "burnrate" only (DESIGN.md, "Name and logo").
const spaceGrotesk = Space_Grotesk({ variable: "--font-space-grotesk", subsets: ["latin"], weight: ["600"] });

export const metadata: Metadata = {
  title: { default: SITE_NAME, template: `%s | ${SITE_NAME}` },
  description: `Will a fire spread in a spacecraft, and what puts it out? ${SITE_TAGLINE}. Built on NASA open data: the Physical Sciences Informatics (PSI) repository.`,
  applicationName: SITE_NAME,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="en"
      data-theme="day"
      suppressHydrationWarning
      className={`${figtree.variable} ${bricolage.variable} ${geistMono.variable} ${spaceGrotesk.variable} h-full`}
    >
      <head>
        {/* The day or night theme, applied before the first paint (lib/theme.ts). */}
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="h-full">
        <AssistantProvider>
          <AppShell>{children}</AppShell>
        </AssistantProvider>
      </body>
    </html>
  );
}
