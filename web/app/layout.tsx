import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";

// Matches the brand typeface already established elsewhere (YourFee),
// and reads cleanly at dashboard data-density: geometric, high-legibility
// at small sizes, distinct numeral shapes (important for a table full of
// timestamps and coordinates).
const plusJakartaSans = Plus_Jakarta_Sans({
  variable: "--font-plus-jakarta-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
});

export const metadata: Metadata = {
  title: "EmpAtt | Field Worker Tracking",
  description: "Admin dashboard for monitoring field workers GPS attendance and journey maps.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${plusJakartaSans.variable} h-full antialiased`}>
      <body className="h-full font-sans">{children}</body>
    </html>
  );
}
