#!/bin/bash
# Switch between patch versions for testing

BACKUP_DIR="patch-backups"
PATCH_DIR="patches"
PATCH_FILE="@tetherto+sdk-fix-openclv1+1.0.0-tmp.runid-19260131899.patch"

case "$1" in
  full)
    cp "$BACKUP_DIR/patch-full.patch" "$PATCH_DIR/$PATCH_FILE"
    echo "✅ FULL patch"
    ;;
  no-translation)
    cp "$BACKUP_DIR/patch-no-translation.patch" "$PATCH_DIR/$PATCH_FILE"
    echo "✅ WITHOUT translation"
    ;;
  no-whisper)
    cp "$BACKUP_DIR/patch-no-whisper-translation.patch" "$PATCH_DIR/$PATCH_FILE"
    echo "✅ WITHOUT whisper & translation"
    ;;
  none)
    rm -f "$PATCH_DIR/$PATCH_FILE"
    echo "✅ NO patches"
    ;;
  *)
    echo "Usage: ./switch-patch.sh [full|no-translation|no-whisper|none]"
    exit 1
    ;;
esac

echo "Run: bun install && ./rebuild.sh"

