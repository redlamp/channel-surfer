import type { Metadata } from "next";
import "@fontsource/barlow/400.css";
import "@fontsource/barlow/500.css";
import "@fontsource/barlow/600.css";
import "@fontsource/barlow/700.css";
import "@fontsource/share-tech-mono";
import "./globals.css";

const SITE_URL = `https://redlamp.github.io${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/`;

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  // No emoji here: the favicon now carries the mark in the tab, and the
  // pair read as redundant. The social titles keep theirs — cards show
  // no favicon.
  title: "Channel Surfer",
  description:
    "Break an image into its RGB and HSB channels to see how each contributes to the final picture.",
  openGraph: {
    title: "Channel Surfer 🏄🌈",
    description:
      "Break an image into its RGB and HSB channels to see how each contributes to the final picture.",
    url: SITE_URL,
    siteName: "Channel Surfer",
    images: [{ url: "og.png", width: 1200, height: 630 }],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Channel Surfer 🏄🌈",
    description:
      "Break an image into its RGB and HSB channels to see how each contributes to the final picture.",
    images: ["og.png"],
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="dark h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
