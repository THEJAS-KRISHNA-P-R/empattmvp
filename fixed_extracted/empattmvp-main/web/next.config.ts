import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  // react-leaflet v5 requires transpilation in Next.js 16
  transpilePackages: ["react-leaflet"],
};

export default nextConfig;
