#!/usr/bin/env bash
# Rebuilds grammars and queries from nixpkgs' Helix and copies them into the
# repo. Takes an optional nixpkgs flake ref; defaults to nixpkgs-unstable.
set -euo pipefail
cd "$(dirname "$0")/.."

nix flake lock --override-input nixpkgs "${1:-github:NixOS/nixpkgs/nixpkgs-unstable}"

out=$(nix build --no-link --print-out-paths .#assets)
rm -rf languages
cp -r "$out/languages" languages
chmod -R u+w languages
install -m 644 "$out/SOURCES" SOURCES
node scripts/declare-tokens.js
cat SOURCES
