import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "The Newsroom",
  description: "A home for independent reporting and thoughtful reading.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
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
