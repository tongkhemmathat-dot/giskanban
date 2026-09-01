#!/bin/sh
set -e
STAMP=$(date +%Y%m%d_%H%M)
DEST=/backup
mkdir -p "$DEST"
sqlite3 /app/data/jobcard.db ".backup '$DEST/jobcard_$STAMP.db'"
tar czf "$DEST/uploads_$STAMP.tar.gz" -C /app/data uploads
find "$DEST" -name '*.db'     -mtime +14 -delete
find "$DEST" -name '*.tar.gz' -mtime +14 -delete
echo "backup ok: $STAMP"
