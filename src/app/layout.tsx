import type { Metadata } from "next";
import { Geist_Mono, Inter, JetBrains_Mono, Poppins, Unbounded } from "next/font/google";
import { AuthProvider } from "@/components/Auth";
import "./globals.css";

const body = Poppins({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-body" });
const display = Unbounded({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-display-face" });
const mono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono" });
// Landing page type (canvas style)
const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const jetbrains = JetBrains_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-jb" });

// Before first paint: apply a saved light/dark pick (see ThemeToggle), and on the landing
// page hide its parts until the agent cursors build them (see Build.tsx).
const BUILD_BOOT = `try{var t=localStorage.getItem("junia-theme");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}try{if(location.pathname==="/"&&!matchMedia("(prefers-reduced-motion: reduce)").matches)document.documentElement.classList.add("lp-build")}catch(e){}`;

export const metadata: Metadata = {
  title: "Junia: outbound research on autopilot",
  description: "Type your website. Junia's agent researches your brand, competitors and buyers, then hands you verified prospects and ready-to-send sequences.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${body.variable} ${display.variable} ${mono.variable} ${inter.variable} ${jetbrains.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: BUILD_BOOT }} />
      </head>
      <body className="min-h-dvh font-sans">
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
