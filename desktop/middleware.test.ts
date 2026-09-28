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
});
