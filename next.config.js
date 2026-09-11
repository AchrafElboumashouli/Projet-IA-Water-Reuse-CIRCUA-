/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  env: {
    NEXT_PUBLIC_MONITORING_API_URL: process.env.NEXT_PUBLIC_MONITORING_API_URL || "http://localhost:8001",
    NEXT_PUBLIC_MONITORING_WS_URL: process.env.NEXT_PUBLIC_MONITORING_WS_URL || "ws://localhost:8001/ws/live",
  },
};

module.exports = nextConfig;
