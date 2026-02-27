import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  reactStrictMode: false,
  // output: 'standalone',
  turbopack: {},
  images: {
    unoptimized: true,
  },
  trailingSlash: true,
  // outputFileTracingRoot: path.join(__dirname),

  serverExternalPackages: [
    'mongoose',
    'mongodb',
    'pdf-parse', 
    'pdf2json',
    '@google/generative-ai',
    '@napi-rs/canvas',          // ← ADD THIS too
  ],
  
  // Keep webpack config
  webpack: (config, { isServer }) => {
    if (isServer) {
      config.externals = [
        ...(Array.isArray(config.externals) ? config.externals : []),
        'mongoose',
        'mongodb',
        'pdf-parse',
        'pdf2json',
        '@google/generative-ai',
        '@napi-rs/canvas',      // ← ADD THIS too
      ];
    }
    return config;
  },
};

export default nextConfig;
