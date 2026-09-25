# Development

## How highlighting works

The extension parses with tree-sitter and runs Helix's highlight, locals and
injection queries, copied unmodified under `languages/`. It reports the
captures to VS Code as semantic tokens. Overlapping captures resolve as in
Helix: on the same range the highest pattern index wins, and a nested range
colors its own text. Injected layers paint over their host, clipped to their
ranges, so Nix interpolations keep their colors.

One rule departs from Helix. `overrides/nix/injections.scm` is appended to
Helix's Nix injection query and makes `testScript` Python. In Helix, a later
pattern for `*Script` attributes claims it as bash.

## Token names

Each Helix capture name is a token type with dots turned into dashes. Every
type declares its prefix as `superType`, so the most specific theme rule wins,
as in Helix. Each type also maps to the TextMate scope of the same Helix name
for themes without semantic rules. `scripts/declare-tokens.js` generates these
declarations in `package.json` from the queries, and the tests fail if they
drift.

## Process model

Highlighting runs in a child process started with V8's `--liftoff-only`. V8's
optimizing compiler spends hundreds of MB compiling large grammar lexers such
as bash's, and V8 flags apply to a whole process, so the flag stays out of the
shared extension host. The worker uses about 75 MB with every language loaded
and grows with the largest file it has parsed. Grammars load on first use.

## Updating grammars and queries

`scripts/refresh.sh` rebuilds `languages/` from nixpkgs' Helix: each
language's grammar as WASM, its Helix queries, and `languages.json`, which
holds the Helix metadata used to resolve injection languages. It pins
nixpkgs-unstable by default, or takes a nixpkgs flake ref to match a specific
Helix build:

```sh
scripts/refresh.sh github:NixOS/nixpkgs/<rev>
```

`SOURCES` records the Helix version and grammar revisions. To bundle another
injection language, add it to `languages` in `flake.nix` and refresh. The
refresh also regenerates the token declarations in `package.json`.

## Building

```sh
nix develop
npm ci
npm test
vsce package
code --install-extension helix-nix-vscode-*.vsix
```

Publishing to the Marketplace uses `vsce publish`. After December 1, 2026,
Azure DevOps stops issuing the global tokens `vsce login` relies on; publish
with `vsce publish --azure-credential` after `az login` instead.
