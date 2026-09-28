// Runs once when the Next server starts (Next.js instrumentation hook).
export async function register() {
  // The phone bridge is a Node http server; skip the edge runtime.
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { syncMobileBridge } = await import("./lib/mobile-bridge");
  await syncMobileBridge().catch((err) => console.error("[mobile-bridge] couldn't start:", err));
}
