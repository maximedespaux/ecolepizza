/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ["docxtemplater", "pizzip"],
  experimental: { serverActions: { bodySizeLimit: "10mb" } },
};

export default nextConfig;
