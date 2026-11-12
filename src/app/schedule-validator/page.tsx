import { redirect } from "next/navigation";
import { DEFAULT_TAB } from "@/features/scheduleValidator/utils/tabs";

/** /schedule-validator itself has no content: it opens the first tab. */
export default function Page() {
  redirect(`/schedule-validator/${DEFAULT_TAB.slug}`);
}
