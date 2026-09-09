import type { NextConfig } from "next";
import { createMDX } from "fumadocs-mdx/next";

const isCI = process.env.CI || process.env.GITHUB_ACTIONS;

const nextConfig: NextConfig = {
  output: "export",
  distDir: "dist",
  basePath: process.env.BASE_PATH || (isCI ? "/Lumi" : ""),
  assetPrefix: process.env.BASE_PATH || (isCI ? "/Lumi" : ""),
  trailingSlash: true,
  reactStrictMode: true,
  agentRules: true,
  images: {
    unoptimized: true,
  },
};

const withMDX = createMDX();

export default withMDX(nextConfig);


