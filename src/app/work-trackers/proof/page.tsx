import { Suspense } from "react";
import { DeliveryProofTab } from "@/features/deliveryProof/components/DeliveryProofTab";

export default function Page() {
  return (
    <Suspense>
      <DeliveryProofTab />
    </Suspense>
  );
}
