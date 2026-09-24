#!/bin/bash

print_usage() {
  echo "Usage: ./run.sh [dev|test|prod]"
  echo "Defaults to 'dev' if not specified."
}

ENV=${1:-dev}

case $ENV in
  dev|test|prod)
    echo "Environment: $ENV"
    ;;
  *)
    echo "❌ Invalid environment."
    print_usage
    exit 1
    ;;
esac

get_package_hash() {
  sha256sum package.json package-lock.json 2>/dev/null | sha256sum | awk '{print $1}'
}

LAST_HASH_FILE=".last_package_hash"
CURRENT_HASH=$(get_package_hash)
LAST_HASH=""

if [ -f "$LAST_HASH_FILE" ]; then
  LAST_HASH=$(cat "$LAST_HASH_FILE")
fi

if [ ! -d "node_modules" ] || [ "$CURRENT_HASH" != "$LAST_HASH" ]; then
  echo "📦 Installing dependencies..."
  npm install
  echo "$CURRENT_HASH" > "$LAST_HASH_FILE"
else
  echo "✅ Dependencies are up to date."
fi

echo "🛠️ Building the app..."
npm run build

# Kill any process running on port 3001
echo "🔍 Checking for processes on port 3001..."
PROCESS_ON_3001=$(lsof -ti:3001)
if [ ! -z "$PROCESS_ON_3001" ]; then
  echo "⚠️  Killing process on port 3001: $PROCESS_ON_3001"
  kill -9 $PROCESS_ON_3001
  sleep 1
else
  echo "✅ Port 3001 is free"
fi

echo "🚀 Starting dev server with environment: $ENV"
npm run dev:$ENV

exit $?