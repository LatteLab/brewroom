#!/bin/sh
set -eu
cd "$(dirname "$0")/.."

portal=de1fb1de9c9b4f57866199a45edcaa1c14b1247d
cafe=cecbfc52defeda802792d056f7d0ea6f3f2c952f
import=df29f747a4dce335c9095dcf2580834815f46e14

git merge-base --is-ancestor "$portal" HEAD
git merge-base --is-ancestor "$cafe" HEAD
test "$(git rev-parse "$portal^{tree}")" = "$(git rev-parse "$import:apps/portal")"
test "$(git rev-parse "$cafe^{tree}")" = "$(git rev-parse "$import:apps/cafe")"
printf '%s\n' 'Both source main commits are ancestors; both imported trees match their sources.'
