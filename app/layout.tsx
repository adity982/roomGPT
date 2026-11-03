import { Analytics } from "@vercel/analytics/react";
import { Metadata } from "next";
import "../styles/globals.css";
import "../styles/studio.css";
import { studioPublicOrigin } from "../utils/studio-config";

let title = "roomGPT Studio";
let description = "Room concepts, project budgets, and client proposals.";
let ogimage = "/og-image.png";
let sitename = "roomGPT Studio";
const siteUrl = new URL(studioPublicOrigin() || "http://localhost:3000");

export const metadata: Metadata = {
  metadataBase: siteUrl,
  title,
  description,
  icons: {
    icon: "/favicon.ico",
  },
  openGraph: {
    images: [ogimage],
    title,
    description,
    url: siteUrl,
    siteName: sitename,
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    images: [ogimage],
    title,
    description,
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-[#17181C] text-white">
        {children}
        <Analytics />
      </body>
    </html>
  );
}
