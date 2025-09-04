#!/bin/bash
set -e

# Enhanced MCP Test Script with Rate Limiting
# Based on the original test_mcp_session.sh but with additional rate limiting tests

# Load test environment configuration if available
if [ -f "$(dirname "$0")/test.env" ]; then
  echo "Loading test environment from test.env..."
  set -a  # Export all variables
  source "$(dirname "$0")/test.env"
  set +a
elif [ -f ".env" ]; then
  echo "Loading test environment from .env..."
  set -a
  source ".env"
  set +a
else
  echo "No test.env found, using default/environment variables..."
fi

TEST_RESULTS=()

# Server configuration
MCP_URL="${MCP_URL:-http://localhost:8080/mcp}"
LEXICON_URL="${LEXICON_URL:-http://localhost:8080}"

# Test data configuration with secure defaults
TEST_FULLSTORY_USER_ID="${TEST_FULLSTORY_USER_ID:-demo_user_id}"
TEST_FULLSTORY_SESSION_ID="${TEST_FULLSTORY_SESSION_ID:-demo_session_id}"
TEST_FULLSTORY_PROFILE_ID="${TEST_FULLSTORY_PROFILE_ID:-demo_profile_id}"


# Generic test data
TEST_USER_ID="${TEST_USER_ID:-test_user_123}"
TEST_SESSION_ID="${TEST_SESSION_ID:-test_session_456}"

# Test configuration
SKIP_REAL_DATA_TESTS="${SKIP_REAL_DATA_TESTS:-false}"
TEST_VERBOSE="${TEST_VERBOSE:-false}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}================================${NC}"
echo -e "${BLUE} Enhanced Lexicon & MCP Tests   ${NC}"
echo -e "${BLUE}================================${NC}"
echo "Configuration:"
echo "  Lexicon URL: $LEXICON_URL"
echo "  MCP URL: $MCP_URL"
echo "  Test User ID: $TEST_FULLSTORY_USER_ID"
echo "  Test Session ID: $TEST_FULLSTORY_SESSION_ID"
echo "  Skip Real Data Tests: $SKIP_REAL_DATA_TESTS"
echo

# Helper to record test results
test_result() {
  local desc="$1"
  local result_json="$2"
  local expected_status="${3:-success}"
  
  if [ "$expected_status" = "rate_limit" ]; then
    # For rate limiting tests, we expect 429 status or rate limit error
    if echo "$result_json" | grep -q '"error".*[Rr]ate.*limit\|HTTP.*429'; then
      echo -e "[${GREEN}OK${NC}] $desc (rate limited as expected)"
      TEST_RESULTS+=("$desc: PASS (rate limited)")
    else
      echo -e "[${RED}ERROR${NC}] $desc (should have been rate limited)"
      TEST_RESULTS+=("$desc: FAIL (not rate limited)")
    fi
  else
    # Normal success test
    if echo "$result_json" | grep -q '"error"'; then
      echo -e "[${RED}ERROR${NC}] $desc failed"
      TEST_RESULTS+=("$desc: FAIL")
    else
      echo -e "[${GREEN}OK${NC}] $desc succeeded"
      TEST_RESULTS+=("$desc: PASS")
    fi
  fi
}

# Test server availability
echo -e "${YELLOW}=== Testing Server Availability ===${NC}"
echo "Testing Lexicon server health..."
HEALTH_RESULT=$(curl -s -w "HTTP_STATUS:%{http_code}" "$LEXICON_URL/health" || echo "HTTP_STATUS:000")
echo "$HEALTH_RESULT"
if echo "$HEALTH_RESULT" | grep -q "HTTP_STATUS:200"; then
  echo -e "[${GREEN}OK${NC}] Lexicon server is healthy"
else
  echo -e "[${RED}ERROR${NC}] Lexicon server is not responding"
fi
echo

echo "Testing MCP server availability..."
MCP_TEST_RESULT=$(curl -s -w "HTTP_STATUS:%{http_code}" -X POST "$MCP_URL" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":0,"method":"tools/list"}' || echo "HTTP_STATUS:000")
echo "$MCP_TEST_RESULT"
if echo "$MCP_TEST_RESULT" | grep -q "HTTP_STATUS:200"; then
  echo -e "[${GREEN}OK${NC}] MCP server is responding"
else
  echo -e "[${RED}ERROR${NC}] MCP server is not responding"
fi
echo

# Rate Limiting Tests for Main Lexicon
echo -e "${YELLOW}=== Rate Limiting Tests (Main Lexicon) ===${NC}"

echo "Testing general endpoint rate limiting..."
for i in {1..8}; do
  RATE_TEST_RESULT=$(curl -s -w "HTTP_STATUS:%{http_code}" "$LEXICON_URL/health" \
    -H "X-Test-Client: rate-limit-test-$i" || echo "HTTP_STATUS:000")
  
  if echo "$RATE_TEST_RESULT" | grep -q "HTTP_STATUS:429"; then
    echo -e "[${GREEN}OK${NC}] Request $i: Rate limited (HTTP 429)"
    break
  elif echo "$RATE_TEST_RESULT" | grep -q "HTTP_STATUS:200"; then
    echo -e "[${BLUE}INFO${NC}] Request $i: Allowed"
  else
    echo -e "[${RED}ERROR${NC}] Request $i: Unexpected response"
  fi
  
  # Small delay to avoid overwhelming
  sleep 0.1
done
echo

# Rate Limiting Tests for MCP
echo -e "${YELLOW}=== Rate Limiting Tests (MCP Mode) ===${NC}"

echo "Testing MCP HTTP rate limiting..."
for i in {1..6}; do
  MCP_RATE_TEST=$(curl -s -w "HTTP_STATUS:%{http_code}" -X POST "$MCP_URL" \
    -H "Content-Type: application/json" \
    -H "X-Test-Client: mcp-rate-test-$i" \
    -d '{"jsonrpc":"2.0","id":'$i',"method":"tools/list"}' || echo "HTTP_STATUS:000")
  
  if echo "$MCP_RATE_TEST" | grep -q "HTTP_STATUS:429"; then
    echo -e "[${GREEN}OK${NC}] MCP Request $i: Rate limited (HTTP 429)"
    break
  elif echo "$MCP_RATE_TEST" | grep -q "HTTP_STATUS:200"; then
    echo -e "[${BLUE}INFO${NC}] MCP Request $i: Allowed"
  else
    echo -e "[${RED}ERROR${NC}] MCP Request $i: Unexpected response"
  fi
  
  sleep 0.1
done
echo

echo "Testing MCP tool-level rate limiting..."
for i in {1..5}; do
  TOOL_RATE_TEST=$(curl -s -X POST "$MCP_URL" \
    -H "Content-Type: application/json" \
    -H "X-Test-Client: tool-rate-test-$i" \
    -d '{"jsonrpc":"2.0","id":'$i',"method":"tools/call","params":{"name":"system_health_check","arguments":{}}}')
  
  if echo "$TOOL_RATE_TEST" | grep -q 'Rate limit exceeded for tool'; then
    echo -e "[${GREEN}OK${NC}] Tool call $i: Rate limited at tool level"
    break
  elif echo "$TOOL_RATE_TEST" | grep -q '"result"'; then
    echo -e "[${BLUE}INFO${NC}] Tool call $i: Allowed"
  else
    echo -e "[${RED}ERROR${NC}] Tool call $i: Unexpected response"
  fi
  
  sleep 0.1
done
echo

# Standard MCP Protocol Tests
echo -e "${YELLOW}=== Standard MCP Protocol Tests ===${NC}"

echo "1. Testing tools/list..."
TOOLS_LIST_RESULT=$(curl -s -X POST "$MCP_URL" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}')
echo "$TOOLS_LIST_RESULT" | jq . 2>/dev/null || echo "$TOOLS_LIST_RESULT"
test_result "tools/list" "$TOOLS_LIST_RESULT"
echo

echo "2. Testing system health check tool..."
HEALTH_TOOL_RESULT=$(curl -s -X POST "$MCP_URL" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"system_health_check","arguments":{}}}')
echo "$HEALTH_TOOL_RESULT" | jq . 2>/dev/null || echo "$HEALTH_TOOL_RESULT"
test_result "system_health_check tool" "$HEALTH_TOOL_RESULT"
echo

echo "3. Testing invalid tool call..."
INVALID_TOOL_RESULT=$(curl -s -X POST "$MCP_URL" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"nonexistent_tool","arguments":{}}}')
echo "$INVALID_TOOL_RESULT" | jq . 2>/dev/null || echo "$INVALID_TOOL_RESULT"
# We expect this to fail
if echo "$INVALID_TOOL_RESULT" | grep -q '"error"'; then
  echo -e "[${GREEN}OK${NC}] Invalid tool call properly rejected"
  TEST_RESULTS+=("invalid_tool_call: PASS (properly rejected)")
else
  echo -e "[${RED}ERROR${NC}] Invalid tool call should have been rejected"
  TEST_RESULTS+=("invalid_tool_call: FAIL (not rejected)")
fi
echo

# Quick Sample of Available Tools
echo -e "${YELLOW}=== Sample Tool Tests ===${NC}"

# Test a few representative tools from each category
SAMPLE_TOOLS=(
  "system_get_status|{}"
  "fullstory_health_check|{}"
)

for TEST in "${SAMPLE_TOOLS[@]}"; do
  IFS='|' read -r TOOL ARGS <<< "$TEST"
  echo "Testing $TOOL..."
  PARAMS="{\"name\":\"$TOOL\",\"arguments\":$ARGS}"
  RESULT=$(curl -s -X POST "$MCP_URL" \
    -H "Content-Type: application/json" \
    -d "{\"jsonrpc\":\"2.0\",\"id\":10,\"method\":\"tools/call\",\"params\":$PARAMS}")
  
  # Just show first 200 chars of result
  echo "${RESULT:0:200}..."
  test_result "$TOOL" "$RESULT"
  echo
  sleep 0.5
done

# Real Data Tests (if enabled)
if [ "$SKIP_REAL_DATA_TESTS" != "true" ]; then
  echo -e "${YELLOW}=== Real Data Tests ===${NC}"
  echo "Testing with real FullStory data..."
  echo

  # FullStory Insights Tests
  echo "Testing FullStory session insights with real data..."
  INSIGHTS_TESTS=(
    "FullStory Session Insights (Default)|fullstory_get_session_insights|{\"user_id\":\"$TEST_FULLSTORY_USER_ID\",\"session_id\":\"$TEST_FULLSTORY_SESSION_ID\",\"outputMode\":\"default\"}"
    "FullStory Session Insights (Light)|fullstory_get_session_insights|{\"user_id\":\"$TEST_FULLSTORY_USER_ID\",\"session_id\":\"$TEST_FULLSTORY_SESSION_ID\",\"outputMode\":\"light\"}"
  )

  for TEST in "${INSIGHTS_TESTS[@]}"; do
    IFS='|' read -r DESC TOOL ARGS <<< "$TEST"
    echo "Testing $DESC..."
    PARAMS="{\"name\":\"$TOOL\",\"arguments\":$ARGS}"
    RESULT=$(curl -s -X POST "$MCP_URL" \
      -H "Content-Type: application/json" \
      -d "{\"jsonrpc\":\"2.0\",\"id\":30,\"method\":\"tools/call\",\"params\":$PARAMS}")
    
    # Just show first 200 chars of result
    echo "${RESULT:0:200}..."
    test_result "$DESC" "$RESULT"
    echo
    sleep 0.5
  done

else
  echo -e "${YELLOW}=== Skipping Real Data Tests ===${NC}"
  echo "Set SKIP_REAL_DATA_TESTS=false to enable real data testing"
  echo
fi

# Rate Limit Recovery Test
echo -e "${YELLOW}=== Rate Limit Recovery Test ===${NC}"
echo "Waiting 3 seconds for rate limit reset..."
sleep 3

echo "Testing that rate limits reset after window..."
RECOVERY_RESULT=$(curl -s -w "HTTP_STATUS:%{http_code}" "$LEXICON_URL/health" \
  -H "X-Test-Client: recovery-test" || echo "HTTP_STATUS:000")

if echo "$RECOVERY_RESULT" | grep -q "HTTP_STATUS:200"; then
  echo -e "[${GREEN}OK${NC}] Rate limit recovery successful"
  TEST_RESULTS+=("rate_limit_recovery: PASS")
else
  echo -e "[${RED}ERROR${NC}] Rate limit recovery failed"
  TEST_RESULTS+=("rate_limit_recovery: FAIL")
fi
echo

# Summary
echo -e "${BLUE}============================${NC}"
echo -e "${BLUE}     TEST SUMMARY           ${NC}"
echo -e "${BLUE}============================${NC}"

PASS_COUNT=0
FAIL_COUNT=0

for RES in "${TEST_RESULTS[@]}"; do
  if echo "$RES" | grep -q "PASS"; then
    echo -e "${GREEN}✓${NC} $RES"
    ((PASS_COUNT++))
  else
    echo -e "${RED}✗${NC} $RES"
    ((FAIL_COUNT++))
  fi
done

echo
echo -e "${BLUE}Total Tests: $((PASS_COUNT + FAIL_COUNT))${NC}"
echo -e "${GREEN}Passed: $PASS_COUNT${NC}"
echo -e "${RED}Failed: $FAIL_COUNT${NC}"

if [ $FAIL_COUNT -eq 0 ]; then
  echo -e "${GREEN}🎉 All tests passed!${NC}"
  exit 0
else
  echo -e "${RED}❌ Some tests failed${NC}"
  exit 1
fi
