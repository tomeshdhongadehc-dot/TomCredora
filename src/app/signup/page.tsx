import type { Metadata } from "next";
import { SignInPage } from "@/components/account/SignInPage";
import { noIndexMeta } from "@/lib/seo";

export const metadata: Metadata = noIndexMeta("Create account");

export default function SignUp() {
  return <SignInPage intent="signup" />;
}
