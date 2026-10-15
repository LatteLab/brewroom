import type { MetadataRoute } from "next";
import { site } from "@/content/site";
export default function sitemap(): MetadataRoute.Sitemap {
  return ["", "/about", "/team", "/scrapbook", "/news", "/join"].map(
    (path) => ({
      url: site.url + path,
      changeFrequency: path === "/scrapbook" ? "monthly" : "yearly",
      priority: path === "" ? 1 : 0.7,
    }),
  );
}
