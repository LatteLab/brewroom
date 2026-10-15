import type { NextConfig } from "next";
const config: NextConfig = {
  async redirects() {
    return [{ source: "/contact", destination: "/join", permanent: true }];
  },
};
export default config;
