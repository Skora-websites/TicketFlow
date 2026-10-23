import assert from "node:assert";
import { z } from "zod";

const meUpdateSchema = z
  .object({
    name: z.string().min(2, "Name must be at least 2 characters").optional(),
    email: z.string().email("Invalid email").optional(),
    avatar: z.string().max(1_000_000, "Avatar image is too large").nullable().optional(),
    currentPassword: z.string().min(1).optional(),
    newPassword: z.string().min(8, "Password must be at least 8 characters").optional(),
  })
  .refine((d) => !d.newPassword || !!d.currentPassword, {
    message: "Current password is required to set a new password",
    path: ["currentPassword"],
  });

console.log("Avatar validation test suite");

// 1. Accepts base64 data URL
const validResult = meUpdateSchema.safeParse({
  avatar: "data:image/webp;base64,UklGRiQAAABXRUJQVlA4IBgAAAAwAQCdASoBAAEAAQAcJaQAA3AA/v39gAA=",
});
assert.strictEqual(validResult.success, true);
console.log("  ok - accepts valid data URL avatar");

// 2. Accepts null to remove avatar
const nullResult = meUpdateSchema.safeParse({
  avatar: null,
});
assert.strictEqual(nullResult.success, true);
console.log("  ok - accepts null to remove avatar");

// 3. Rejects avatar string that exceeds size limit
const largeString = "a".repeat(1_000_001);
const oversizedResult = meUpdateSchema.safeParse({
  avatar: largeString,
});
assert.strictEqual(oversizedResult.success, false);
console.log("  ok - rejects oversized avatar string");

console.log("All avatar tests passed!");
