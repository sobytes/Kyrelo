import { describe, expect, it } from "vitest";
import { IMAGE_EXT_BY_TYPE, imageTypeForFilename, imageUploadError, SAFE_IMAGE_FILENAME } from "./uploads";

describe("image upload rules", () => {
  it("accepts filenames the upload routes produce", () => {
    for (const ext of Object.values(IMAGE_EXT_BY_TYPE)) {
      expect(SAFE_IMAGE_FILENAME.test(`2f0c8a1e-1111-4a4a-9b9b-123456789abc${ext}`)).toBe(true);
    }
  });

  it("rejects paths, dotfiles and unsupported types", () => {
    for (const bad of ["../api-keys.json", "..\\\\x.png", ".png", "a/b/c-123456.png", "photo-123456.heic", "x.svg"]) {
      expect(SAFE_IMAGE_FILENAME.test(bad)).toBe(false);
    }
  });

  it("does not accept HEIC, which X can't post", () => {
    expect(IMAGE_EXT_BY_TYPE["image/heic"]).toBeUndefined();
  });
});

describe("imageUploadError", () => {
  it("accepts a supported image within the size limit", () => {
    expect(imageUploadError(new File([new Uint8Array(10)], "a.png", { type: "image/png" }))).toBeNull();
  });

  it("rejects HEIC and oversized files with a readable message", () => {
    expect(imageUploadError(new File([new Uint8Array(10)], "a.heic", { type: "image/heic" }))).toMatch(/PNG, JPEG/);
    const big = new File([new Uint8Array(5 * 1024 * 1024 + 1)], "a.png", { type: "image/png" });
    expect(imageUploadError(big)).toMatch(/5 MB/);
  });
});

describe("imageTypeForFilename", () => {
  it("maps stored extensions back to their content type", () => {
    expect(imageTypeForFilename("x.png")).toBe("image/png");
    expect(imageTypeForFilename("x.jpg")).toBe("image/jpeg");
    expect(imageTypeForFilename("x.jpeg")).toBe("image/jpeg");
    expect(imageTypeForFilename("x.txt")).toBeUndefined();
  });
});
