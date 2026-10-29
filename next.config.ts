import path from 'node:path'
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  serverExternalPackages: ['pg'],
  outputFileTracingRoot: path.join(__dirname),
  allowedDevOrigins: ['127.0.0.1', 'localhost'],
  experimental: {
    serverActions: {
      bodySizeLimit: '2mb',
    },
  },
}

export default nextConfig
