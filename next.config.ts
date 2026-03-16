import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 이미지 원격 소스 허용 포맷
  images: {
    formats: ["image/avif", "image/webp"],
  },
  // 헤더 보안 + 캐싱
  headers: async () => [
    {
      source: "/(.*)",
      headers: [
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "X-Frame-Options", value: "DENY" },
      ],
    },
    {
      // 정적 자산 캐싱 (JS, CSS, 폰트)
      source: "/_next/static/(.*)",
      headers: [
        { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
      ],
    },
  ],
};

export default nextConfig;
