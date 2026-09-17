import { SupabaseClient } from "@supabase/supabase-js";
import { Database } from "../../../../database.types";

type CreateInput = {
  name: string;
  row_count: number;
  roof_type: "canopy" | "none";
  description: string | null;
};

export async function createBleacherType(
  input: CreateInput,
  supabase: SupabaseClient<Database>,
): Promise<string> {
  const { data, error } = await supabase.from("BleacherTypes").insert(input).select("id").single();

  if (error || !data) throw new Error(error?.message ?? "Insert failed");
  return data.id;
}

export async function updateBleacherType(
  id: string,
  input: Partial<CreateInput>,
  supabase: SupabaseClient<Database>,
): Promise<void> {
  const { error } = await supabase.from("BleacherTypes").update(input).eq("id", id);

  if (error) throw new Error(error.message);
}

export async function softDeleteBleacherType(
  id: string,
  supabase: SupabaseClient<Database>,
): Promise<void> {
  const { error } = await supabase.from("BleacherTypes").update({ deleted: true }).eq("id", id);

  if (error) throw new Error(error.message);
}
