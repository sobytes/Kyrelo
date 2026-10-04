/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Dev only: Next drops a compiled page after 60s unused and keeps just 5,
  // so switching back to a tab recompiled it (seconds of "frozen" app). The
  // app has a handful of pages and routes the worker hits every 30-90s; keep
  // them all compiled for the session.
  // Pages from before the app was organised by service.
  async redirects() {
    return [
      { source: "/detector", destination: "/x/monitor", permanent: false },
      { source: "/:service/scheduler", destination: "/scheduler", permanent: false },
      { source: "/deleter", destination: "/x/deleter", permanent: false },
      { source: "/unfollow", destination: "/x/unfollow", permanent: false },
      { source: "/connected", destination: "/", permanent: false },
    ];
  },
  onDemandEntries: {
    maxInactiveAge: 12 * 60 * 60 * 1000,
    pagesBufferLength: 100,
  },
  experimental: {
    // middleware.ts runs on every /api route, and Next keeps only this much
    // of a request body for the route after it (10 MB by default), which cut
    // video uploads short. Kyrelo's video limit (lib/uploads.ts
    // MAX_VIDEO_BYTES, 256 MB) plus room for the multipart wrapping.
    middlewareClientMaxBodySize: 260 * 1024 * 1024,
  },
    outputFileTracingExcludes: {
    "*": [".data/**/*", "dist/**/*", "build/**/*"],
  },
};

export default nextConfig;
