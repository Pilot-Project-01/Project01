import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  // Sandpack's in-browser bundler breaks under React StrictMode's dev-only
  // double-invoke (its client registers → unregisters → re-registers, leaving
  // the bundler iframe stuck — tests hang, the Output panel goes stale). This
  // only affects `next dev`; production builds never double-invoke. Off so dev
  // behaves like prod for the sandbox.
  reactStrictMode: false,
};

export default nextConfig;
