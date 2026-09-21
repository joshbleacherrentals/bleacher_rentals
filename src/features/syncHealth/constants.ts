export const SYNC_HEALTH_PATH = "/dev-tools/sync-health";

/**
 * `max_parameter_query_results` in br_powersync/config/powersync.yaml. A
 * connection past it fails with PSYNC_S2305. Keep the two in step.
 */
export const SYNC_BUCKET_LIMIT = 2000;

/** From this share of the limit a driver is highlighted: time to act. */
export const NEAR_LIMIT_RATIO = 0.7;
