import { describe, expect, it } from "vitest";
import { fetchOgImage, screenshotPage } from "./media";

// These URLs come from AI output, so anything pointing at this machine or the
// local network must be refused before any request is made.
describe("campaign media URL guard", () => {
  it.each(["http://localhost:3000/api/campaigns", "http://127.0.0.1/", "http://[::1]/", "http://192.168.1.10/", "http://10.0.0.1/"])(
    "refuses %s",
    async (url) => {
      await expect(fetchOgImage(url)).rejects.toThrow(/refusing local address/);
    },
  );

  it("refuses non-web protocols", async () => {
    await expect(fetchOgImage("file:///etc/passwd")).rejects.toThrow(/not an http/);
  });

  it("only screenshots pages on the product's own site", async () => {
    await expect(screenshotPage("https://1.1.1.1/", "https://kyrelo.com")).rejects.toThrow(/isn't on kyrelo.com/);
  });
});
