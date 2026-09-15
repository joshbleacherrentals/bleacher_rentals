import { Database } from "../../database.types";

/**
 * A table name the Pusher `update-database` broadcast can carry.
 *
 * Used to live in `zustandRegistery`, alongside the map of stores to invalidate.
 * The stores are gone; the broadcast still fires and still types its payload, so
 * the name outlives the registry. Both go when the broadcast does.
 */
export type TableName = keyof Database["public"]["Tables"];
