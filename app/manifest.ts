import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "야외봄",
    short_name: "야외봄",
    description: "걷기·애견산책·러닝·등산·자전거까지, 나가기 좋은 시간을 알려주는 야외활동 컨디션 앱",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#e9eef6",
    theme_color: "#2f6bff",
    categories: ["health", "sports", "weather", "lifestyle"],
    lang: "ko-KR",
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png"
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png"
      },
      {
        src: "/icons/maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable"
      }
    ]
  };
}
