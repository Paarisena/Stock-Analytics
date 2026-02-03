import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    unoptimized: true, // Required for static export
  },
  trailingSlash: true, // Helps with file routing
};

export default nextConfig;
