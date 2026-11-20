import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  outputFileTracingRoot: process.cwd(),
  serverExternalPackages: ['pg'],
  experimental: {
    serverActions: {
      bodySizeLimit: '6mb',
    },
  },
}

export default nextConfig
