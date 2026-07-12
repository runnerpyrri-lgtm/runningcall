import type { Metadata, Viewport } from "next";
import { PwaRegister } from "@/app/pwa-register";
import "./globals.css";

export const metadata: Metadata = {
  title: "야외봄 — 걷기·등산·산책·러닝·자전거, 나가기 좋은 시간",
  description:
    "기온·체감·미세먼지·자외선·강수·바람을 종합해 걷기·애견산책·러닝·등산·자전거 점수와 나가기 좋은 시간을 알려드려요.",
  applicationName: "야외봄",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "야외봄",
    statusBarStyle: "default"
  },
  icons: {
    icon: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" }
    ],
    apple: [{ url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }]
  }
};

export const viewport: Viewport = {
  themeColor: "#fff7ed",
  viewportFit: "cover"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body>
        <PwaRegister />
        {children}
      </body>
    </html>
  );
}
