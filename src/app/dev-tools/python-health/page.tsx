"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/PageHeader";

export default function PythonHealthPage() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<unknown>(null);
  const [error, setError] = useState<string | null>(null);

  const handleCheck = async () => {
    setLoading(true);
    setResult(null);
    setError(null);
    try {
      const res = await fetch("/api/py/health", { cache: "no-store" });
      if (!res.ok) {
        const hint =
          res.status === 404 && process.env.NODE_ENV === "development"
            ? " Is the Python dev server running? Start it with `npm run dev:py`."
            : "";
        throw new Error(`Request failed with status ${res.status}.${hint}`);
      }
      setResult(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6 max-w-2xl">
      <PageHeader
        title="Python Health"
        subtitle="Checks that the Python service answers. Locally, run npm run dev:py first (once: npm run setup:py)."
      />
      <Button onClick={handleCheck} disabled={loading}>
        {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        Call Python
      </Button>
      {error && <p className="mt-4 text-sm text-red-600">{error}</p>}
      {result !== null && (
        <pre className="mt-4 rounded border bg-gray-50 p-4 text-sm overflow-auto">
          {JSON.stringify(result, null, 2)}
        </pre>
      )}
    </div>
  );
}
