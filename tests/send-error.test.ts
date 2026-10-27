import { describe, expect, it } from "vitest";
import { describeSendError } from "@/lib/auth/client";

describe("what a visitor is told when the sign-in link cannot be sent", () => {
  it("blames the service, not the address, when it cannot be reached", () => {
    for (const e of [{ name: "AuthRetryableFetchError", status: 0, message: "Failed to fetch" }, { status: 503 }, { message: "TypeError: fetch failed" }, {}]) {
      expect(describeSendError(e), JSON.stringify(e)).toMatch(/cannot reach the sign-in service/);
    }
  });
  it("says to wait when too many emails were requested", () => {
    expect(describeSendError({ status: 429, message: "email rate limit exceeded" })).toMatch(/Wait a few minutes/);
    expect(describeSendError({ status: 400, message: "For security purposes, you can only request this after 60 seconds (over_email_send_rate_limit)" })).toMatch(/Wait a few minutes/);
  });
  it("only blames the address for an ordinary refusal", () => {
    expect(describeSendError({ status: 400, name: "AuthApiError", message: "Email address is invalid" })).toMatch(/Check the address/);
  });
  it("reassures that nothing was lost and offers a way on", () => {
    expect(describeSendError({ status: 0 })).toMatch(/safe in this browser/);
    expect(describeSendError({ status: 0 })).toMatch(/continue without an account/);
  });
});
