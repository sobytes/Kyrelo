import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { middleware } from "./middleware";

function request(headers: Record<string, string>, method = "POST") {
  return new NextRequest("http://127.0.0.1:3000/api/deleter", { method, headers });
}

describe("API origin guard", () => {
  it("allows the app's own window", () => {
    const res = middleware(
      request({ host: "127.0.0.1:3000", origin: "http://127.0.0.1:3000", "sec-fetch-site": "same-origin" }),
    );
    expect(res.status).toBe(200);
  });

  it("allows the background worker (no browser headers)", () => {
    expect(middleware(request({ host: "127.0.0.1:3000" }, "GET")).status).toBe(200);
  });

  it("blocks a request from another website", () => {
    const res = middleware(
      request({ host: "127.0.0.1:3000", origin: "https://evil.example", "sec-fetch-site": "cross-site" }),
    );
    expect(res.status).toBe(403);
  });

  it("blocks another origin even without Sec-Fetch-Site", () => {
    expect(middleware(request({ host: "127.0.0.1:3000", origin: "https://evil.example" })).status).toBe(403);
  });

  it("blocks DNS-rebinding hosts", () => {
    expect(middleware(request({ host: "evil.example:3000" }, "GET")).status).toBe(403);
  });

  it("lets a Mastodon server send the browser back to the sign-in callback, and nothing else", () => {
    const fromMastodon = { host: "127.0.0.1:3000", "sec-fetch-site": "cross-site" };
    const callback = (method: string, host = "127.0.0.1:3000") =>
      new NextRequest("http://127.0.0.1:3000/api/accounts/mastodon/callback?code=x&state=y", {
        method,
        headers: { ...fromMastodon, host },
      });
    expect(middleware(callback("GET")).status).toBe(200);
    // Only a plain GET, only there, and still only on this computer.
    expect(middleware(callback("POST")).status).toBe(403);
    expect(middleware(callback("GET", "evil.example")).status).toBe(403);
    expect(middleware(request(fromMastodon, "GET")).status).toBe(403);
  });
});

