import type { Metadata } from "next";
import type { ReactNode } from "react";
import localFont from "next/font/local";
import "./globals.css";

const technor = localFont({
  src: [
    { path: "./fonts/Technor-Regular.woff2", weight: "400" },
    { path: "./fonts/Technor-Bold.woff2", weight: "700" },
  ],
  variable: "--font-technor-family",
  display: "swap",
  fallback: ["Arial", "Helvetica", "sans-serif"],
});

export const metadata: Metadata = {
  title: "TaskFlow — Make good work move",
  description: "Keep the next step clear with TaskFlow.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${technor.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
