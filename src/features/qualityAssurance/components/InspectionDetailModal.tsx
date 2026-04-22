"use client";

import { useMemo, useState } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";
import { useClerkSupabaseClient } from "@/utils/supabase/useClerkSupabaseClient";
import { CheckCircle2, AlertTriangle, X } from "lucide-react";
import type { InspectionListRow } from "../hooks/useInspections";

type InspectionAnswer = {
  question_text: string;
  question_type: "text" | "checkbox" | "photo" | string;
  required?: boolean;
  // Newer shape:
  answer_text?: string | null;
  answer_boolean?: boolean | null;
  // Legacy shape (some records use `value`):
  value?: string | boolean | null;
  photos?: { storage_path: string }[];
};

function parseAnswers(json: string | null): Record<string, InspectionAnswer> {
  if (!json) return {};
  try {
    const parsed = JSON.parse(json);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function readText(a: InspectionAnswer): string | null {
  if (a.answer_text != null) return a.answer_text;
  if (typeof a.value === "string") return a.value;
  return null;
}

function readBool(a: InspectionAnswer): boolean | null {
  if (typeof a.answer_boolean === "boolean") return a.answer_boolean;
  if (typeof a.value === "boolean") return a.value;
  return null;
}

export default function InspectionDetailModal({
  row,
  onClose,
}: {
  row: InspectionListRow | null;
  onClose: () => void;
}) {
  const supabase = useClerkSupabaseClient();
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

  const answers = useMemo(() => parseAnswers(row?.answersJson ?? null), [row?.answersJson]);
  const entries = Object.entries(answers);

  const getPhotoUrl = (path: string) => {
    const { data } = supabase.storage.from("inspection-photos").getPublicUrl(path);
    return data.publicUrl;
  };

  const open = !!row;

  return (
    <>
      <Dialog open={open} onOpenChange={(v) => (!v ? onClose() : undefined)}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <VisuallyHidden>
            <DialogTitle>Inspection Details</DialogTitle>
          </VisuallyHidden>

          {row && (
            <div>
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h2 className="text-lg font-semibold text-darkBlue">
                    {row.inspectionKind === "pre" ? "Pre-trip" : "Post-trip"} Inspection
                  </h2>
                  <p className="text-sm text-gray-500">
                    Bleacher{" "}
                    {row.bleacherNumber != null ? `#${row.bleacherNumber}` : "—"}
                    {" · "}
                    {[row.driverFirstName, row.driverLastName].filter(Boolean).join(" ") || "—"}
                    {" · "}
                    {row.createdAt
                      ? new Date(row.createdAt).toLocaleString()
                      : row.workTrackerDate ?? "—"}
                  </p>
                </div>
              </div>

              <div className="flex gap-4 text-xs mb-4">
                <span
                  className={`inline-flex items-center gap-1 font-medium ${
                    row.walkAroundComplete ? "text-green-700" : "text-gray-500"
                  }`}
                >
                  {row.walkAroundComplete ? <CheckCircle2 className="w-3.5 h-3.5" /> : null}
                  Walk-around: {row.walkAroundComplete ? "Complete" : "Incomplete"}
                </span>
                <span
                  className={`inline-flex items-center gap-1 font-medium ${
                    row.issuesFound ? "text-yellow-700" : "text-green-700"
                  }`}
                >
                  {row.issuesFound ? <AlertTriangle className="w-3.5 h-3.5" /> : null}
                  Issues: {row.issuesFound ? "Yes" : "None"}
                </span>
              </div>

              {row.issueDescription && (
                <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded">
                  <p className="text-xs font-semibold text-yellow-800 uppercase tracking-wide mb-1">
                    Issue Description
                  </p>
                  <p className="text-sm text-gray-800 whitespace-pre-wrap">
                    {row.issueDescription}
                  </p>
                </div>
              )}

              {entries.length === 0 ? (
                <p className="text-sm text-gray-400 italic">No question answers recorded.</p>
              ) : (
                <div className="space-y-3">
                  {entries.map(([questionId, answer]) => {
                    const text = readText(answer);
                    const bool = readBool(answer);
                    return (
                      <div
                        key={questionId}
                        className="bg-gray-50 border border-gray-200 rounded-md px-3 py-2"
                      >
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-sm font-medium text-gray-800">
                            {answer.question_text}
                          </span>
                          <span className="text-[10px] text-gray-500 bg-gray-200 px-1.5 py-0.5 rounded">
                            {answer.question_type}
                          </span>
                          {answer.required && (
                            <span className="text-[10px] text-red-600 bg-red-50 px-1.5 py-0.5 rounded">
                              required
                            </span>
                          )}
                        </div>

                        {answer.question_type === "text" && (
                          <p className="text-sm text-gray-700 whitespace-pre-wrap">
                            {text ?? <span className="text-gray-400 italic">No answer</span>}
                          </p>
                        )}

                        {answer.question_type === "checkbox" && (
                          <span
                            className={`text-xs font-medium ${
                              bool ? "text-green-700" : "text-red-700"
                            }`}
                          >
                            {bool == null ? "—" : bool ? "Yes" : "No"}
                          </span>
                        )}

                        {answer.question_type === "photo" && (
                          <div className="flex flex-wrap gap-2 mt-1">
                            {answer.photos && answer.photos.length > 0 ? (
                              answer.photos.map((photo, i) => {
                                const url = getPhotoUrl(photo.storage_path);
                                const isHeic = /\.heic$/i.test(photo.storage_path);
                                return (
                                  <button
                                    key={i}
                                    type="button"
                                    onClick={() => setLightboxUrl(url)}
                                    className="w-20 h-20 rounded-lg overflow-hidden border border-gray-200 bg-white cursor-pointer hover:opacity-80 transition flex items-center justify-center"
                                  >
                                    {isHeic ? (
                                      <span className="text-[10px] text-gray-500 px-1 text-center">
                                        HEIC
                                        <br />
                                        photo
                                      </span>
                                    ) : (
                                      // eslint-disable-next-line @next/next/no-img-element
                                      <img
                                        src={url}
                                        alt={`${answer.question_text} photo ${i + 1}`}
                                        className="w-full h-full object-cover"
                                      />
                                    )}
                                  </button>
                                );
                              })
                            ) : (
                              <span className="text-xs text-gray-400 italic">No photos</span>
                            )}
                          </div>
                        )}

                        {answer.question_type !== "text" &&
                          answer.question_type !== "checkbox" &&
                          answer.question_type !== "photo" && (
                            <p className="text-xs text-gray-500">
                              {text ?? (bool != null ? String(bool) : "—")}
                            </p>
                          )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!lightboxUrl} onOpenChange={(v) => (!v ? setLightboxUrl(null) : undefined)}>
        <DialogContent className="max-w-4xl p-0 bg-transparent border-0 shadow-none">
          <VisuallyHidden>
            <DialogTitle>Inspection photo</DialogTitle>
          </VisuallyHidden>
          {lightboxUrl && (
            <div className="relative">
              <button
                type="button"
                onClick={() => setLightboxUrl(null)}
                className="absolute -top-3 -right-3 bg-white text-gray-700 rounded-full p-1 shadow hover:bg-gray-100"
                aria-label="Close photo"
              >
                <X className="w-4 h-4" />
              </button>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={lightboxUrl}
                alt="Inspection"
                className="w-full max-h-[85vh] object-contain rounded-lg"
              />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
