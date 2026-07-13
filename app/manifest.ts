import type { MetadataRoute } from "next";
import { publicPath } from "@/lib/public-path";

export const dynamic = "force-static";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "야외봄",
    short_name: "야외봄",
    description: "걷기·애견산책·러닝·등산·자전거까지, 나가기 좋은 시간을 알려주는 야외활동 컨디션 앱",
    start_url: publicPath("/"),
    scope: publicPath("/"),
    display: "standalone",
    orientation: "portrait",
    background_color: "#fff7ed",
    theme_color: "#fff7ed",
    categories: ["health", "sports", "weather", "lifestyle"],
    lang: "ko-KR",
    icons: [
      {
        src: publicPath("/icons/icon-192.png"),
        sizes: "192x192",
        type: "image/png"
      },
      {
        src: publicPath("/icons/icon-512.png"),
        sizes: "512x512",
        type: "image/png"
      },
      {
        src: publicPath("/icons/maskable-512.png"),
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable"
      }
    ]
  };
}
