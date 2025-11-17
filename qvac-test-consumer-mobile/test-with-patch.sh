#!/bin/bash
# Test with or without lazy loading patch

case "$1" in
  with)
    echo "Testing WITH lazy loading patch..."
    rm -rf node_modules/@tetherto/sdk-fix-openclv1
    bun install
    echo "✅ Patch applied. Run: ./rebuild.sh"
    ;;
  without)
    echo "Testing WITHOUT patch (vanilla SDK)..."
    rm patches/@tetherto+sdk-fix-openclv1+1.0.0-tmp.runid-19260131899.patch
    rm -rf node_modules/@tetherto/sdk-fix-openclv1
    bun install
    echo "✅ Vanilla SDK. Run: ./rebuild.sh"
    echo "⚠️  To restore patch: git checkout patches/"
    ;;
  *)
    echo "Usage: ./test-with-patch.sh [with|without]"
    exit 1
    ;;
esac

