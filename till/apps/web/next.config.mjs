/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "export",
  // Directory-style routes (pay/index.html) so the export works on any
  // static file server, not only hosts that rewrite /pay to pay.html.
  trailingSlash: true,
  reactStrictMode: true,
  transpilePackages: ["@till/sdk"],
  images: { unoptimized: true },
};

export default nextConfig;
