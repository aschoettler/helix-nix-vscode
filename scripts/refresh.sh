#!/usr/bin/env bash
# Rebuilds the grammar and query from nixpkgs' Helix and copies them into the
# repo. With no argument, updates nixpkgs to the latest locked branch. With a
# flake ref, pins nixpkgs to it, e.g. github:NixOS/nixpkgs/<rev>.
set -euo pipefail
cd "$(dirname "$0")/.."

if [ $# -gt 0 ]; then
  nix flake lock --override-input nixpkgs "$1"
else
  nix flake update nixpkgs
fi

out=$(nix build --no-link --print-out-paths .#assets)
install -m 644 "$out/grammar/tree-sitter-nix.wasm" grammar/
install -m 644 "$out/queries/highlights.scm" queries/
install -m 644 "$out/SOURCES" SOURCES
cat SOURCES
