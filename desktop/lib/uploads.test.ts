import { describe, expect, it } from "vitest";
import { IMAGE_EXT_BY_TYPE, imageTypeForFilename, imageTypeFromBytes, imageUploadError, SAFE_IMAGE_FILENAME } from "./uploads";

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

  it("knows an image by its bytes, not by what the sender says it is", () => {
    const bytes = (...b: number[]) => Buffer.from([...b, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(imageTypeFromBytes(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a))).toBe("image/png");
    expect(imageTypeFromBytes(bytes(0xff, 0xd8, 0xff, 0xe0))).toBe("image/jpeg");
    expect(imageTypeFromBytes(Buffer.from("GIF89a"))).toBe("image/gif");
    expect(imageTypeFromBytes(Buffer.from("RIFF\0\0\0\0WEBPVP8 "))).toBe("image/webp");
    for (const notImage of ["<html><script>alert(1)</script>", "<svg xmlns='http://www.w3.org/2000/svg'/>", "RIFF\0\0\0\0WAVEfmt ", ""]) {
      expect(imageTypeFromBytes(Buffer.from(notImage))).toBeUndefined();
    }
  });
});
