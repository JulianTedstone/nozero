import { Analytics } from "@vercel/analytics/react";
import type { Metadata } from "next";
import { Geist_Mono, Inter, Newsreader } from "next/font/google";
import type React from "react";
import { Suspense } from "react";
import { AuthProvider } from "@/components/session-provider";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/toaster";
import "streamdown/styles.css";
import "./globals.css";
import { cn } from "@/lib/utils";

// Inter — body, interface, the wordmark (everything structural).
const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });
// Newsreader — serif display, h1-equivalent titles only. Italic carries emphasis.
const newsreader = Newsreader({
  subsets: ["latin"],
  variable: "--font-display",
  style: ["normal", "italic"],
  weight: ["400", "500", "600"],
});
// Geist Mono — instrument layer: eyebrows, captions, plate numbers, code.
const geistMono = Geist_Mono({ subsets: ["latin"], variable: "--font-mono" });

const fontVars = cn(inter.variable, newsreader.variable, geistMono.variable);

export const metadata: Metadata = {
  title: "nozero",
  description:
    "Transform your time management with AI. nozero learns your patterns, optimizes your schedule, and gives you back what matters most. A nopilot product.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={cn("font-sans", fontVars)}
    >
      <body className={cn(fontVars, "font-sans antialiased")}>
        <Suspense fallback={null}>
          <AuthProvider>
            <ThemeProvider
              attribute="class"
              defaultTheme="dark"
              enableSystem
            >
              {children}
              <Toaster />
            </ThemeProvider>
          </AuthProvider>
        </Suspense>
        <Analytics />
      </body>
    </html>
  );
}
