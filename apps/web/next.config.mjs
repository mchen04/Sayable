/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ["ws"],
  transpilePackages: ["@sayable/core"],
  typedRoutes: false,
  // Allow the dev HMR / React Refresh client to work when the app is opened from
  // either loopback origin (some tooling uses 127.0.0.1, others localhost).
  // Dev-only; no effect on production builds.
  allowedDevOrigins: ["127.0.0.1", "localhost"]
};

export default nextConfig;
