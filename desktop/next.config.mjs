/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Dev only: Next drops a compiled page after 60s unused and keeps just 5,
  // so switching back to a tab recompiled it (seconds of "frozen" app). The
  // app has a handful of pages and routes the worker hits every 30-90s; keep
  // them all compiled for the session.
  onDemandEntries: {
    maxInactiveAge: 12 * 60 * 60 * 1000,
    pagesBufferLength: 100,
  },
  outputFileTracingExcludes: {
    "*": [".data/**/*", "dist/**/*", "build/**/*"],
  },
};

export default nextConfig;
