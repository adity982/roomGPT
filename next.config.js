/** @type {import('next').NextConfig} */
module.exports = {
  reactStrictMode: true,
  distDir: process.env.NODE_ENV === "development" ? ".next-dev" : ".next",
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "upcdn.io" },
      { protocol: "https", hostname: "replicate.delivery" },
      { protocol: "https", hostname: "**.replicate.delivery" },
    ],
  },
  async headers() {
    return [
      {
        source: "/review/:path*",
        headers: [
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
          { key: "Cache-Control", value: "private, no-store" },
        ],
      },
    ];
  },
};
