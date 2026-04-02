import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Secured Health Records",
  description:
    "Machine Learning-Enhanced Secure Platform for Electronic Health Record sharing with proactive threat detection.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
