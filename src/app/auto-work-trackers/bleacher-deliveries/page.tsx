import { Suspense } from "react";
import { BleacherDeliveriesTab } from "@/features/autoWorkTrackers/components/BleacherDeliveriesTab";

export default function Page() {
  return (
    <Suspense>
      <BleacherDeliveriesTab />
    </Suspense>
  );
}
