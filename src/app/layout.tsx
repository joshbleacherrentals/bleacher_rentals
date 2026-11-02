import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ClerkProvider } from "@clerk/nextjs";
import { auth } from "@clerk/nextjs/server";
import { AuthFallback } from "@/components/AuthFallback";
import { SignedInShell } from "@/components/SignedInShell";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Bleacher Rentals Admin",
  description:
    "This application is an internal tool for Bleacher Rentals to manage their customers and logistics.",
  icons: {
    icon: "/favicon.png",
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const { userId } = await auth();

  return (
    <ClerkProvider>
      <html lang="en">
        <body className={`${geistSans.variable} ${geistMono.variable} antialiased overflow-hidden`}>
          {userId ? (
            <SignedInShell>{children}</SignedInShell>
          ) : (
            <AuthFallback>{children}</AuthFallback>
          )}
        </body>
      </html>
    </ClerkProvider>
  );
}
