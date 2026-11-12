import { Suspense, type ReactNode } from "react";
import { ScheduleValidatorShell } from "@/features/scheduleValidator/components/ScheduleValidatorShell";

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <div className="p-4">
      {/* The shell reads the week from the address, which needs a Suspense boundary. */}
      <Suspense>
        <ScheduleValidatorShell>{children}</ScheduleValidatorShell>
      </Suspense>
    </div>
  );
}
