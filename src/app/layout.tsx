import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Dear You — little things, made to mean more",
    template: "%s · Dear You",
  },
  description: "Make beautiful digital cards, private Duo experiences, and meaningful little surprises for the people you love.",
  applicationName: "Dear You",
  openGraph: {
    title: "Dear You — little things, made to mean more",
    description: "A softer place to make someone's day.",
    type: "website",
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return <html lang="en" suppressHydrationWarning><body>{children}</body></html>;
}
