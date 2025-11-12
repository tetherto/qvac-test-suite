#!/bin/bash
# Test different patch combinations

PATCH_FILE="patches/@tetherto+sdk-fix-openclv1+1.0.0-tmp.runid-19260131899.patch"

case "$1" in
  full)
    echo "=== FULL patch (llamacpp+tts+whisper) ==="
    cp patch-backups/patch-full.patch "$PATCH_FILE"
    ;;
  no-whisper)
    echo "=== NO whisper (llamacpp+tts only) ==="
    cp patch-backups/patch-no-whisper.patch "$PATCH_FILE"
    ;;
  no-tts)
    echo "=== NO TTS (llamacpp+whisper only) ==="
    cp patch-backups/patch-no-tts.patch "$PATCH_FILE"
    ;;
  only-llm)
    echo "=== ONLY LLM (llamacpp+load-model) ==="
    cp patch-backups/patch-only-llm.patch "$PATCH_FILE"
    ;;
  none)
    echo "=== NO patches (vanilla SDK) ==="
    rm -f "$PATCH_FILE"
    ;;
  *)
    echo "Usage: ./test-patch.sh [full|no-whisper|no-tts|only-llm|none]"
    echo ""
    echo "Versions:"
    echo "  full       - All lazy loading (LLM+TTS+Whisper)"
    echo "  no-whisper - Skip whisper tests"
    echo "  no-tts     - Skip TTS tests"
    echo "  only-llm   - Only LLM/completion tests"
    echo "  none       - Vanilla SDK"
    exit 1
    ;;
esac

echo "✅ Configured"
echo ""
echo "Next:"
echo "  rm -rf node_modules/@tetherto/sdk-fix-openclv1"
echo "  bun install"
echo "  ./rebuild.sh"

