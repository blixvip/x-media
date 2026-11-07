import "@fontsource-variable/jetbrains-mono";
import "@fontsource-variable/space-grotesk";

import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "X Master — Radar Intelligence",
  description: "The legacy X Radar route now opens the unified X Master workspace.",
  alternates: { canonical: "/x-master" },
  openGraph: {
    title: "X Master",
    description: "Radar intelligence and a creator engine trained on your voice.",
    type: "website",
    url: "/x-master",
    images: [{ url: "/virality-tracker-og.png", width: 1731, height: 909, alt: "X Master creator intelligence workspace" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "X Master",
    description: "Find the moment. Write the post.",
    images: ["/virality-tracker-og.png"],
  },
};

export default function XRadarLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
