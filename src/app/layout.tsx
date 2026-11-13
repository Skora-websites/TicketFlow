import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { Providers } from "@/components/Providers";
import { PwaRegister } from "@/components/PwaRegister";

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

export const viewport: Viewport = {
  themeColor: "#120A20",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export const metadata: Metadata = {
  title: "TicketFlow - Modern Ticketing System",
  description: "A comprehensive ticketing system with role-based access control",
  applicationName: "TicketFlow",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "TicketFlow",
  },
  icons: {
    icon: "/icons/icon-192.png",
    apple: "/icons/apple-touch-icon.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark" data-color-theme="purple" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `try{
              var p = window.location.pathname;
              var isApp = p.startsWith('/dashboard') || p.startsWith('/client');
              var t = localStorage.getItem('ticketflow-color-theme') || 'purple';
              document.documentElement.setAttribute('data-color-theme', t);
              var m = localStorage.getItem('theme') || 'dark';
              var isLight = isApp && (m === 'light' || (m === 'system' && !window.matchMedia('(prefers-color-scheme: dark)').matches));
              if (isLight) {
                document.documentElement.classList.add('light');
                document.documentElement.classList.remove('dark');
              } else {
                document.documentElement.classList.add('dark');
                document.documentElement.classList.remove('light');
              }
            }catch(e){}`,
          }}
        />
      </head>
      <body
        className={`${plusJakarta.variable} ${inter.variable} ${gitlabMono.variable} antialiased`}
      >
        <Providers>
          <PwaRegister />
          {children}
        </Providers>
      </body>
    </html>
  );
}
