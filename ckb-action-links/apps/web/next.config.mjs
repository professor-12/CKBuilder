/** @type {import('next').NextConfig} */
const nextConfig = {
  // The SDK ships raw TypeScript so the workspace needs no build step.
  transpilePackages: ["@ckb-action-links/sdk"],
};

export default nextConfig;
