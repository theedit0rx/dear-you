import type { NextConfig } from "next";

const workerOrigin = process.env.DEAR_YOU_WORKER_ORIGIN?.trim().replace(/\/$/, "");

const nextConfig: NextConfig = {
  async rewrites() {
    if (!workerOrigin) return [];
    return {
      beforeFiles: [
        {
          source: "/api/:path*",
          destination: `${workerOrigin}/api/:path*`,
        },
      ],
    };
  },
};

export default nextConfig;
