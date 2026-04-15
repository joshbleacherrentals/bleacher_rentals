"use client";

import { PageHeader } from "@/components/PageHeader";
import { InspectionQuestionsForm } from "./_components/InspectionQuestionsForm";

export default function InspectionQuestionsPage() {
  return (
    <>
      <PageHeader
        title="Inspection Form Configuration"
        subtitle="Configure the inspection form questions for drivers"
      />
      <p className="text-sm text-gray-500 mb-4">
        All changes are saved automatically. Each submission will already include the driver,
        bleacher, and date &amp; time.
      </p>
      <InspectionQuestionsForm />
    </>
  );
}
