import type { NextConfig } from "next";
import { withPostHogConfig } from "@posthog/nextjs-config";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'rlmgbbqyokizudzhfydp.supabase.co',
        pathname: '/storage/v1/object/public/**',
      },
    ],
  },
};

const hasPostHogSourceMaps =
  process.env.CI &&
  process.env.POSTHOG_API_KEY &&
  process.env.POSTHOG_PROJECT_ID;

export default hasPostHogSourceMaps
  ? withPostHogConfig(nextConfig, {
      personalApiKey: process.env.POSTHOG_API_KEY!,
      projectId: process.env.POSTHOG_PROJECT_ID!,
      host: process.env.NEXT_PUBLIC_POSTHOG_HOST,
      sourcemaps: {
        enabled: true,
        deleteAfterUpload: true,
      },
    })
  : nextConfig;
