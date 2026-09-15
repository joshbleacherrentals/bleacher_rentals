"use server";

import { pusherServer } from "@/lib/pusher.server";
import { TableName } from "@/lib/tableName";

export const updateDataBase = async (tables: TableName[]) => {
  try {
    // console.log("Updating database", tables);
    await pusherServer.trigger("db-changes-channel", "update-database", {
      tables,
    });
  } catch (error: any) {
    throw new Error("Failed to update database: ", error.message);
  }
};
