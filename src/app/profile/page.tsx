import type { Metadata } from "next";
import { ProfileEditor } from "@/components/profile/ProfileEditor";
import { noIndexMeta } from "@/lib/seo";

export const metadata: Metadata = noIndexMeta("My profile");

export default function ProfilePage() {
  return <ProfileEditor />;
}
