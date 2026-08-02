/** @type {import('next').NextConfig} */
const nextConfig = {
  basePath: "/os",
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  async redirects() {
    return [
      { source: '/sign-in', destination: '/dashboard', permanent: false },
      { source: '/sign-up', destination: '/dashboard', permanent: false },
      { source: '/protected', destination: '/dashboard', permanent: false },
      { source: '/auth/:path*', destination: '/dashboard', permanent: false },
    ]
  },
}

export default nextConfig
