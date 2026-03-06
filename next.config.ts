import type { NextConfig } from "next";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

const nextConfig: NextConfig = {
  // 禁用图片优化，避免 Windows 下 resvg.wasm 路径问题
  images: { unoptimized: true },
};

initOpenNextCloudflareForDev();

export default nextConfig;
