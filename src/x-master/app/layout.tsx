import type { Metadata, Viewport } from "next";
import "./globals.css";
import "./public-dark-palette.css";
import "./tracker-theme.css";

const localSiteUrl = "http://localhost:3000";
const publicSiteUrl = "https://ai-virality-radar.wasely.chatgpt.site";
const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL ??
  (process.env.NODE_ENV === "production" ? publicSiteUrl : localSiteUrl);

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: "X Master — Find the Moment. Write the Post.",
  description: "Your X workspace for live discovery, voice-trained creation, drafts, media, and human-reviewed publishing.",
  alternates: {
    canonical: "/",
    types: { "application/atom+xml": "/api/public-feed" },
  },
  openGraph: {
    title: "X Master",
    description: "X, Hacker News, GitHub and the stories worth following.",
    type: "website",
    url: "/",
    images: [{ url: "/virality-tracker-og.png", width: 1731, height: 909, alt: "X Master creator intelligence workspace" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "X Master",
    description: "X, Hacker News, GitHub and the stories worth following.",
    images: ["/virality-tracker-og.png"],
  },
  icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "X Master",
  },
};

export const viewport: Viewport = {
  colorScheme: "dark",
  themeColor: "#15161b",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
