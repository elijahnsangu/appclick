import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    background_color: "#ffffff",
    display: "standalone",
    icons: [{ sizes: "any", src: "/icon.png", type: "image/png" }],
    name: "Marliket Pro",
    short_name: "Marliket Pro",
    start_url: "/",
    theme_color: "#0a0a0a",
  };
}
