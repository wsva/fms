import type { NextConfig } from "next";

const nextConfig: NextConfig = {
    reactCompiler: true,
    output: 'standalone',
    allowedDevOrigins: ['100.124.177.123'],
    experimental: {
        serverActions: {
            bodySizeLimit: '50mb',
        },
    },
};

export default nextConfig;
