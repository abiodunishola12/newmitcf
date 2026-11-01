/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [{ hostname: 'localhost' }],
  },
  async rewrites() {
    return [
      {
        source: '/graph/:path*',
        destination: 'http://localhost:8000/graph/:path*',
      },
    ];
  },
};

export default nextConfig;
