/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Static export: the whole app (user panel + admin panel) is served as
  // static files by nginx, which proxies /api/* to the FastAPI backend.
  output: 'export',
  images: {
    unoptimized: true,
  },
}

module.exports = nextConfig
