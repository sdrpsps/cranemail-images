import { Analytics } from "@vercel/analytics/next";
import type { Metadata } from "next";
import type { ReactNode } from "react";

import { Toaster } from "@/components/ui/sonner";

import "./globals.css";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL!

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  applicationName: "CraneMail Images",
  title: {
    default: "CraneMail Images | CraneMail Workspace Image Host",
    template: "%s | CraneMail Images",
  },
  description:
    "A lightweight CraneMail workspace image hosting dashboard for uploading, syncing, sharing, and managing public image links.",
  keywords: [
    "CraneMail",
    "CraneMail workspace",
    "image hosting",
    "workspace storage",
    "file sharing",
    "Telegram upload bot",
    "public image links",
  ],
  authors: [{ name: "CraneMail Images" }],
  creator: "CraneMail Images",
  publisher: "CraneMail Images",
  category: "technology",
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    url: "/",
    siteName: "CraneMail Images",
    title: "CraneMail Images | CraneMail Workspace Image Host",
    description:
      "Upload images to CraneMail workspace storage, generate public links, sync workspace files, and manage uploads from web or Telegram.",
  },
  twitter: {
    card: "summary",
    title: "CraneMail Images | CraneMail Workspace Image Host",
    description:
      "Upload, sync, share, and manage CraneMail workspace images from a focused web dashboard.",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <html lang="en" className="h-full font-sans antialiased">
      <body className="min-h-full flex flex-col">
        {children}
        <Toaster />
        <Analytics />
      </body>
    </html>
  );
}
