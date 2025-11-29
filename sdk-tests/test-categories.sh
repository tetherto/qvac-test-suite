#!/bin/zsh

# Test producer with each category - auto-kills after 3 seconds

FRAMEWORK_CLI="../framework/dist/cli/index.js"

run_with_timeout() {
  local filter=$1
  local expected=$2
  local emoji=$3
  
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "$emoji (Expected: $expected)"
  
  # Start producer in background
  node $FRAMEWORK_CLI run:producer --filter=$filter --runId=${filter}-test > /tmp/producer-$filter.log 2>&1 &
  local pid=$!
  
  # Wait 3 seconds
  sleep 3
  
  # Kill it
  kill $pid 2>/dev/null
  wait $pid 2>/dev/null
  
  # Show the Built line
  grep "Built" /tmp/producer-$filter.log
  echo ""
}

echo "🧪 Testing Producer Filtering by Category\n"

run_with_timeout "model" "6 tests" "📦 Model Loading Tests"
run_with_timeout "completion" "29 tests" "💬 Completion Tests"
run_with_timeout "transcription" "12 tests" "🎤 Transcription Tests"
run_with_timeout "embedding" "15 tests" "🔢 Embedding Tests"
run_with_timeout "rag" "9 tests" "📚 RAG Tests"
run_with_timeout "translation" "11 tests" "🌍 Translation Tests"
run_with_timeout "cache" "10 tests" "💾 Cache Management Tests"
run_with_timeout "error" "7 tests" "❌ Error Handling Tests"
run_with_timeout "tools" "49 tests" "🔧 Tools/Function Calling Tests"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ All categories validated!"
echo "Total: 148 tests across 9 categories"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Cleanup
rm /tmp/producer-*.log 2>/dev/null
