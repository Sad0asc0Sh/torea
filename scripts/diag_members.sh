#!/usr/bin/env bash

set -euo pipefail

echo "=== Through nginx (https://127.0.0.1 with Host header) ==="
for i in {1..5}; do
  curl -k -s -o /dev/null -H "Host: alamis.info" -w "code=%{http_code} time=%{time_total}\n" \
    "https://127.0.0.1/admin/definitions/teams/3/members"
done

echo "=== Direct app (http://127.0.0.1:3000) ==="
for i in {1..5}; do
  curl -s -o /dev/null -w "code=%{http_code} time=%{time_total}\n" \
    "http://127.0.0.1:3000/admin/definitions/teams/3/members"
done
