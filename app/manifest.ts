import type { MetadataRoute } from "next";
import { publicPath } from "@/lib/public-path";
import manifestContract from "@/src/family-manifest.json";

export const dynamic = "force-static";

export default function manifest(): MetadataRoute.Manifest {
  return {
    ...manifestContract,
    start_url: publicPath("/"),
    scope: publicPath("/"),
    display: manifestContract.display as MetadataRoute.Manifest["display"],
    orientation: manifestContract.orientation as MetadataRoute.Manifest["orientation"],
    icons: manifestContract.icons.map((icon) => ({ ...icon, src: publicPath(icon.src) })) as MetadataRoute.Manifest["icons"]
  };
}
