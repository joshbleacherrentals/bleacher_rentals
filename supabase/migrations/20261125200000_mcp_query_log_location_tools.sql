-- docs/specs/analytics-mcp.md §12: the analytics connector gains two GPS tools, logged like the
-- others. Their arguments (which bleachers, which window) go in the sql column.
ALTER TABLE "McpQueryLog" DROP CONSTRAINT mcp_query_log_tool_check;
ALTER TABLE "McpQueryLog" ADD CONSTRAINT mcp_query_log_tool_check CHECK (
  tool IN ('query', 'describe_schema', 'access', 'bleacher_locations', 'bleacher_location_history')
);
