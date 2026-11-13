import type { Metadata } from "next";
import { JobsPage } from "@/components/jobs/JobsPage";
import { noIndexMeta } from "@/lib/seo";

export const metadata: Metadata = noIndexMeta("Applications");

export default function Page() {
  return <JobsPage />;
}
