import { Suspense } from "react";
import { BleacherDataTab } from "@/features/scheduleValidator/components/BleacherDataTab";

export default function Page() {
  return (
    <Suspense>
      <BleacherDataTab />
    </Suspense>
  );
}
