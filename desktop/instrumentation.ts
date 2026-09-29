// Runs once when the Next server starts (Next.js instrumentation hook).
export async function register() {
  // The phone bridge is a Node http server. The import must sit inside this
  // check (not after an early return) so webpack leaves it out of the edge
  // build, which can't load node:crypto.
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { syncMobileBridge } = await import("./lib/mobile-bridge");
    await syncMobileBridge().catch((err) => console.error("[mobile-bridge] couldn't start:", err));
  }
}
