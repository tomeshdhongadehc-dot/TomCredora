import type { Metadata } from "next";
import { Builder } from "@/components/builder/Builder";
import { noIndexMeta } from "@/lib/seo";

export const metadata: Metadata = noIndexMeta("Build your resume");

export default function BuildPage() {
  return <Builder />;
}
