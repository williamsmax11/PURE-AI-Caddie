#!/bin/bash
# EAS pre-install hook: ensure .expo/web cache dir exists for iOS builds
# The EAS build server may pre-create .expo with restrictive permissions,
# so we remove it first and recreate with correct ownership.
rm -rf .expo 2>/dev/null || true
mkdir -p .expo/web 2>/dev/null || true
exit 0
