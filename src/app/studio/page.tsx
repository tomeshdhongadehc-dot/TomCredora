import type { Metadata } from "next";
import { Studio } from "@/components/studio/Studio";
import { noIndexMeta } from "@/lib/seo";

export const metadata: Metadata = noIndexMeta("Workspace");

export default function StudioPage() {
  return <Studio />;
}
