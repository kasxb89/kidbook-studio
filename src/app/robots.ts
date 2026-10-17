import type { MetadataRoute } from "next";
import { toAbsoluteAppUrl } from "@/lib/site-url";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/api/"],
    },
    sitemap: [toAbsoluteAppUrl("/sitemap.xml"), toAbsoluteAppUrl("/inspiration/sitemap.xml")],
  };
}
