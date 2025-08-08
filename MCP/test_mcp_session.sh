#!/bin/bash
set -e

TEST_RESULTS=()

MCP_URL="http://localhost:8080/mcp"

echo
echo "2. Calling fullstory_get_session_insights with valid userId and sessionId..."
INSIGHTS_RESULT=$(curl -s -X POST "$MCP_URL" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"fullstory_get_session_insights","arguments":{"userId":"8433093806100453990","sessionId":"145798577041661417"}}}')
echo "$INSIGHTS_RESULT"
if echo "$INSIGHTS_RESULT" | grep -q '"error"'; then
  echo "[ERROR] fullstory_get_session_insights call failed"
else
  echo "[OK] fullstory_get_session_insights call succeeded"
fi
echo

echo "1. Initializing MCP protocol (no session)..."
INIT_JSON=$(curl -s -X POST "$MCP_URL" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}')
echo "$INIT_JSON"

SESSION_ID=""

echo
echo "2. Calling tools/list without session (should succeed)..."
curl -s -X POST "$MCP_URL" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/list"}'
echo

echo
echo "3. Calling tools/call without session (should fail)..."
curl -s -X POST "$MCP_URL" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"fullstory_get_user","arguments":{}}}'
echo

# Helper to record test results
test_result() {
  local desc="$1"
  local result_json="$2"
  if echo "$result_json" | grep -q '"error"'; then
    echo "[ERROR] $desc failed"
    TEST_RESULTS+=("$desc: FAIL")
  else
    echo "[OK] $desc succeeded"
    TEST_RESULTS+=("$desc: PASS")
  fi
}

# Test warehouse tools
for TOOL in \
  warehouse_execute_query \
  warehouse_get_table_schema \
  warehouse_list_tables \
  warehouse_list_schemas \
  warehouse_describe_table \
  warehouse_quick_query \
  warehouse_quick_query_info \
  warehouse_generate_sql \
  warehouse_analytics_query \
  warehouse_health_check \
  warehouse_get_capabilities \
  warehouse_test_connection; do
  echo "2. Calling tools/call with session (\033[1m$TOOL\033[0m)..."
  RESULT=$(curl -s -X POST "$MCP_URL" \
    -H "Content-Type: application/json" \
    -H "Accept: application/json, text/event-stream" \
    -H "mcp-session-id: $SESSION_ID" \
    -d "{\"jsonrpc\":\"2.0\",\"id\":2,\"method\":\"tools/call\",\"params\":{\"name\":\"$TOOL\",\"arguments\":{}}}")
  echo "$RESULT"
  test_result "$TOOL" "$RESULT"
  echo
done

# Test fullstory tools

# --- FullStory Endpoint Tests (auto-generated from fullstory-tools.js config) ---
FULLSTORY_TESTS=(
  # Session Profile APIs
  "fullstory_get_profile|{\"profile_id\":\"test_profile_id\"}"
  "fullstory_list_session_profiles|{}"
  "fullstory_update_profile|{\"profile_id\":\"test_profile_id\",\"name\":\"Test Profile\"}"
  # Session Context APIs
  "fullstory_generate_session_context|{\"session_id\":\"test_session_id\"}"
  "fullstory_generate_context|{\"session_id\":\"test_session_id\"}"
  # Session Summary/Events/Insights
  "fullstory_generate_session_summary|{\"user_id\":\"test_user_id\",\"session_id\":\"test_session_id\"}"
  "fullstory_get_session_events|{\"user_id\":\"test_user_id\",\"session_id\":\"test_session_id\"}"
  "fullstory_get_session_insights|{\"user_id\":\"test_user_id\",\"session_id\":\"test_session_id\"}"
  # User APIs
  "fullstory_create_user|{\"uid\":\"test_user_id\",\"display_name\":\"Test User\"}"
  "fullstory_get_user|{\"userId\":\"test_user_id\"}"
  # V1 APIs
  "fullstory_list_sessions|{\"uid\":\"test_user_id\"}"
  "fullstory_get_recording_block_rules|{}"
  "fullstory_get_user_events|{\"uid\":\"test_user_id\"}"
  "fullstory_get_user_pages|{\"uid\":\"test_user_id\"}"
  # Analytics, Insights, Health
  "fullstory_get_user_profile|{\"userIdentifier\":\"test_user_id\"}"
  "fullstory_get_user_analytics|{\"userIdentifier\":\"test_user_id\"}"
  "fullstory_health_check|{}"
)

for TEST in "${FULLSTORY_TESTS[@]}"; do
  IFS='|' read -r TOOL ARGS <<< "$TEST"
  echo "2. Calling tools/call with session (\033[1m$TOOL\033[0m)..."
  PARAMS="{\"name\":\"$TOOL\",\"arguments\":$ARGS}"
  RESULT=$(curl -s -X POST "$MCP_URL" \
    -H "Content-Type: application/json" \
    -H "Accept: application/json, text/event-stream" \
    -H "mcp-session-id: $SESSION_ID" \
    -d "{\"jsonrpc\":\"2.0\",\"id\":2,\"method\":\"tools/call\",\"params\":$PARAMS}")
  echo "$RESULT"
  test_result "$TOOL" "$RESULT"
  echo
done

# --- BigQuery Warehouse Tool Tests ---
BQ_PROJECT_ID="project-364429034474444891"
BQ_DATASET="fs_data_destinations"
BQ_DATABASE="${BQ_PROJECT_ID}.${BQ_DATASET}"
BQ_TABLE="agnes_test_18pnwr_clicks"  # TODO: Replace with a real table name in the dataset

BIGQUERY_TESTS=(
  "List Schemas|tools/call|{\"name\":\"warehouse_list_schemas\",\"arguments\":{\"platform\":\"bigquery\",\"projectId\":\"$BQ_PROJECT_ID\",\"dataset\":\"$BQ_DATASET\",\"database\":\"$BQ_DATABASE\"}}"
  "List Tables|tools/call|{\"name\":\"warehouse_list_tables\",\"arguments\":{\"platform\":\"bigquery\",\"projectId\":\"$BQ_PROJECT_ID\",\"dataset\":\"$BQ_DATASET\",\"database\":\"$BQ_DATABASE\"}}"
  "Select Top 5 Rows|tools/call|{\"name\":\"warehouse_execute_query\",\"arguments\":{\"platform\":\"bigquery\",\"projectId\":\"$BQ_PROJECT_ID\",\"dataset\":\"$BQ_DATASET\",\"sql\":\"SELECT * FROM $BQ_DATABASE.$BQ_TABLE LIMIT 5\"}}"
)

for TEST in "${BIGQUERY_TESTS[@]}"; do
  IFS='|' read -r DESC METHOD PARAMS <<< "$TEST"
  echo "[BigQuery] $DESC..."
  RESULT=$(curl -s -X POST "$MCP_URL" \
    -H "Content-Type: application/json" \
    -H "Accept: application/json, text/event-stream" \
    -d "{\"jsonrpc\":\"2.0\",\"id\":10,\"method\":\"$METHOD\",\"params\":$PARAMS}")
  echo "$RESULT"
  test_result "$DESC" "$RESULT"
  echo
  sleep 1
done

# --- FullStory Session Insights Mode Tests ---
echo
echo "Testing FullStory Session Insights with different output modes..."
echo

INSIGHTS_MODE_TESTS=(
  "Session Insights (Default Mode)|fullstory_get_session_insights|{\"user_id\":\"8433093806100453990\",\"session_id\":\"145798577041661417\",\"outputMode\":\"default\"}"
  "Session Insights (Verbose Mode)|fullstory_get_session_insights|{\"user_id\":\"8433093806100453990\",\"session_id\":\"145798577041661417\",\"outputMode\":\"verbose\"}"
  "Session Insights (Light Mode)|fullstory_get_session_insights|{\"user_id\":\"8433093806100453990\",\"session_id\":\"145798577041661417\",\"outputMode\":\"light\"}"
)

for TEST in "${INSIGHTS_MODE_TESTS[@]}"; do
  IFS='|' read -r DESC TOOL ARGS <<< "$TEST"
  echo "[Insights Mode Test] $DESC..."
  PARAMS="{\"name\":\"$TOOL\",\"arguments\":$ARGS}"
  RESULT=$(curl -s -X POST "$MCP_URL" \
    -H "Content-Type: application/json" \
    -H "Accept: application/json, text/event-stream" \
    -H "mcp-session-id: $SESSION_ID" \
    -d "{\"jsonrpc\":\"2.0\",\"id\":20,\"method\":\"tools/call\",\"params\":$PARAMS}")
  echo "$RESULT"
  test_result "$DESC" "$RESULT"
  echo
  sleep 1
done

echo
echo "5. Closing session..."
curl -s -X POST "$MCP_URL" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "mcp-session-id: $SESSION_ID" \
  -d '{"jsonrpc":"2.0","id":5,"method":"closeSession"}'
echo

echo
echo "6. Calling tools/call with closed session (should fail)..."
curl -s -X POST "$MCP_URL" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "mcp-session-id: $SESSION_ID" \
  -d '{"jsonrpc":"2.0","id":6,"method":"tools/call","params":{"name":"fullstory_get_user","arguments":{}}}'
echo

echo "===================="
echo " MCP TEST SUMMARY"
echo "===================="
for RES in "${TEST_RESULTS[@]}"; do
  echo "$RES"
done