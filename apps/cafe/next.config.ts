import type { NextConfig } from "next";
import { resolve } from "node:path";
const config: NextConfig = {
  outputFileTracingRoot: resolve(process.cwd(), "../.."),
  async redirects() {
    return [{ source: "/contact", destination: "/join", permanent: true }];
  },
};
export default config;
