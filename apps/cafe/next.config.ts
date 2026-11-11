import type { NextConfig } from "next";
import { resolve } from "node:path";
const config: NextConfig = {
  outputFileTracingRoot: resolve(process.cwd(), "../.."),
  async redirects() {
    return [
      { source: "/contact", destination: "/join", permanent: true },
      {
        source: "/rainbowfall26",
        destination:
          "https://docs.google.com/forms/d/e/1FAIpQLSehksMqyMcjoGBzjVTWztFLLfGuS73e6vxILwOYKr8vNDK6oA/viewform",
        permanent: false,
      },
    ];
  },
};
export default config;
