import type { Metadata } from "next";
import { SignInPage } from "@/components/account/SignInPage";
import { noIndexMeta } from "@/lib/seo";

export const metadata: Metadata = noIndexMeta("Sign in");

export default function SignIn() {
  return <SignInPage />;
}
