import { redirect } from "next/navigation";
import { DEFAULT_PAGE } from "@/features/autoWorkTrackers/utils/pages";

/** /auto-work-trackers itself has no content: it opens the first page. */
export default function Page() {
  redirect(`/auto-work-trackers/${DEFAULT_PAGE.slug}`);
}
