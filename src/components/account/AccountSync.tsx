"use client";

import { useEffect } from "react";
import { bootAccount } from "@/lib/sync/boot";

/** Boots the account button once per page load. Renders nothing; costs nothing when nobody is signed in. */
export function AccountSync() {
  useEffect(() => bootAccount(), []);
  return null;
}
