/** @type {import('next').NextConfig} */

const nextConfig = {
  output: 'export',
  productionBrowserSourceMaps: true,
  reactStrictMode: true,
  images: {
    unoptimized: true
  },
  turbopack: {}
}

module.exports = nextConfig
