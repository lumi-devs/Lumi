import type { NextConfig } from "next";

const isCI = process.env.CI || process.env.GITHUB_ACTIONS;

const nextConfig: NextConfig = {
  output: "export",
  distDir: "dist",
  basePath: process.env.BASE_PATH || (isCI ? "/Lumi" : ""),
  assetPrefix: process.env.BASE_PATH || (isCI ? "/Lumi" : ""),
  trailingSlash: true,
  reactStrictMode: true,
  // @ts-expect-error Next 16 experimental option
  agentRules: true,
  images: {
    unoptimized: true,
  },
};

export default nextConfig;


