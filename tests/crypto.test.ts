import { afterEach, describe, expect, it } from "vitest";
import { decrypt, encrypt } from "../src/lib/crypto";

const original = process.env.CREDENTIAL_ENCRYPTION_KEY;
afterEach(() => { process.env.CREDENTIAL_ENCRYPTION_KEY = original; });

describe("credential encryption", () => {
  it("round trips without storing plaintext", () => {
    process.env.CREDENTIAL_ENCRYPTION_KEY = Buffer.alloc(32, 4).toString("base64");
    const cipher = encrypt("tsk_private_example");
    expect(cipher).not.toContain("tsk_private_example");
    expect(decrypt(cipher)).toBe("tsk_private_example");
    expect(encrypt("tsk_private_example")).not.toBe(cipher);
  });
  it("rejects a wrong key", () => {
    process.env.CREDENTIAL_ENCRYPTION_KEY = Buffer.alloc(32, 4).toString("base64");
    const cipher = encrypt("tsk_private_example");
    process.env.CREDENTIAL_ENCRYPTION_KEY = Buffer.alloc(32, 5).toString("base64");
    expect(() => decrypt(cipher)).toThrow();
  });
});
