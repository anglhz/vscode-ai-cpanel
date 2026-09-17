import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Next.js blocks cross-origin requests to dev-only resources (the HMR websocket,
  // /__nextjs_font/*, etc.) unless the requesting host is listed here. Without this,
  // loading the dev server over the LAN IP breaks the HMR client and React never
  // hydrates, so client components fall back to native (GET) form submission.
  allowedDevOrigins: ["192.168.0.171", "192.168.0.*"],
};

export default nextConfig;
