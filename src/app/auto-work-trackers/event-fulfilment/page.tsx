import { Suspense } from "react";
import { EventFulfilmentTab } from "@/features/autoWorkTrackers/components/EventFulfilmentTab";

export default function Page() {
  return (
    <Suspense>
      <EventFulfilmentTab />
    </Suspense>
  );
}
