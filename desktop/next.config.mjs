/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  outputFileTracingExcludes: {
    "*": [".data/**/*", "dist/**/*", "build/**/*"],
  },
};

export default nextConfig;
