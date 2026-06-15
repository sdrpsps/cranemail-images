import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Upload Dashboard",
  description: "Manage CraneMail workspace image uploads, public links, Telegram binding, and workspace sync.",
  robots: {
    index: false,
    follow: false,
  },
};

export default function UploadLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return children;
}
