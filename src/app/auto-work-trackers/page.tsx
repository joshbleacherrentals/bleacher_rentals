import { redirect } from "next/navigation";
import { DEFAULT_TAB } from "@/features/autoWorkTrackers/utils/tabs";

/** /auto-work-trackers itself has no content: it opens the first tab. */
export default function Page() {
  redirect(`/auto-work-trackers/${DEFAULT_TAB.slug}`);
}
