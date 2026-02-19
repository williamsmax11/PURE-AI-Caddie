#!/bin/bash
# EAS pre-install hook: ensure .expo/web exists for iOS builds
# This script NEVER exits non-zero — the build must continue regardless

echo "=== EAS Pre-Install ==="
echo "pwd: $(pwd)"
echo "user: $(whoami) ($(id -u))"

# Check if .expo already exists (EAS infrastructure may create it)
if [ -d ".expo" ]; then
  echo ".expo exists with permissions:"
  ls -ld .expo
  echo ".expo owner: $(stat -f '%Su:%Sg' .expo 2>/dev/null || stat -c '%U:%G' .expo 2>/dev/null)"

  # Try to remove the pre-existing .expo directory
  echo "Removing pre-existing .expo..."
  rm -rf .expo 2>&1 || true

  if [ -d ".expo" ]; then
    echo "WARNING: Could not remove .expo (owned by different user)"
    # Last resort: try to chmod it writable
    chmod -R u+rwx .expo 2>/dev/null || true
  fi
else
  echo ".expo does not exist yet — good"
fi

# Create .expo/web cache directory
echo "Creating .expo/web..."
mkdir -p .expo/web 2>&1 || true

if [ -d ".expo/web" ]; then
  echo "SUCCESS: .expo/web created"
else
  echo "WARNING: .expo/web could not be created — build will continue without it"
fi

echo "=== Pre-Install Done ==="
exit 0
