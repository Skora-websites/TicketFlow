import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { Providers } from "@/components/Providers";

import { Plus_Jakarta_Sans } from "next/font/google";

const plusJakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-jakarta",
  weight: ["400", "500", "600", "700", "800"],
  display: "swap",
});

const inter = localFont({
  src: "./fonts/Inter-Variable.woff2",
  variable: "--font-inter",
  weight: "100 900",
  display: "swap",
});

const gitlabMono = localFont({
  src: "./fonts/GitLabMono-Variable.woff2",
  variable: "--font-gitlab-mono",
  weight: "300 600",
  display: "swap",
});

const incognito = localFont({
  src: [
    { path: "./fonts/Incognito-Regular.woff2", weight: "400", style: "normal" },
    { path: "./fonts/Incognito-SemiBold.woff2", weight: "600", style: "normal" },
    { path: "./fonts/Incognito-Bold.woff2", weight: "700", style: "normal" },
    { path: "./fonts/Incognito-ExtraBold.woff2", weight: "800", style: "normal" },
  ],
  variable: "--font-incognito",
  display: "swap",
});

export const metadata: Metadata = {
  title: "TicketFlow - Modern Ticketing System",
  description: "A comprehensive ticketing system with role-based access control",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `try{
              var p = window.location.pathname;
              var isApp = p.startsWith('/dashboard') || p.startsWith('/client');
              if (!isApp) {
                document.documentElement.classList.add('dark');
                document.documentElement.classList.remove('light');
                document.documentElement.setAttribute('data-color-theme', 'purple');
              } else {
                var t = localStorage.getItem('ticketflow-color-theme');
                if (t) document.documentElement.setAttribute('data-color-theme', t);
              }
            }catch(e){}`,
          }}
        />
      </head>
      <body
        className={`${plusJakarta.variable} ${inter.variable} ${gitlabMono.variable} ${incognito.variable} antialiased`}
      >
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
