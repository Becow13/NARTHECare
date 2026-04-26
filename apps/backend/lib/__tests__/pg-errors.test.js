import test from "node:test"
import assert from "node:assert/strict"
import { isUsersEmailUniqueViolation } from "../pg-errors.js"

test("isUsersEmailUniqueViolation is true for users_email_key constraint", () => {
  const err = { code: "23505", constraint: "users_email_key" }
  assert.equal(isUsersEmailUniqueViolation(err), true)
})

test("isUsersEmailUniqueViolation is true when detail names the email key", () => {
  const err = {
    code: "23505",
    detail: 'Key (email)=(a@b.com) already exists.',
  }
  assert.equal(isUsersEmailUniqueViolation(err), true)
})

test("isUsersEmailUniqueViolation is false for other violations", () => {
  const err = { code: "23505", constraint: "users_pkey" }
  assert.equal(isUsersEmailUniqueViolation(err), false)
})

test("isUsersEmailUniqueViolation is false for non-objects", () => {
  assert.equal(isUsersEmailUniqueViolation(null), false)
  assert.equal(isUsersEmailUniqueViolation("23505"), false)
})
