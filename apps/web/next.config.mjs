/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ["ws"],
  transpilePackages: ["@sayable/core"],
  typedRoutes: false
};

export default nextConfig;
