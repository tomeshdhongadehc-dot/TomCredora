import type { Metadata } from "next";
import { QuickResume } from "@/components/quick/QuickResume";
import { noIndexMeta } from "@/lib/seo";

export const metadata: Metadata = noIndexMeta("Quick resume");

export default function QuickPage() {
  return <QuickResume />;
}
