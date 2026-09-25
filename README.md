# Helix Nix Highlighting

Colors Nix in VS Code the way Helix does. The extension parses with
tree-sitter-nix, runs Helix's `highlights.scm`, and hands the result to VS Code
as semantic tokens. A TextMate grammar can't tell `nullOr` in
`types.nullOr types.str` from `str`; the parse tree can.

It needs [Nix IDE](https://marketplace.visualstudio.com/items?itemName=jnoortheen.nix-ide),
which provides the `nix` language, the language server, and the base
TextMate colors. This extension only adds the semantic token layer. It turns
on `editor.semanticHighlighting.enabled` for Nix files only.

## Theme keys

Token names are Helix capture names. VS Code splits them at the first dot:
`variable.other.member` is type `variable` with modifiers `other` and
`member`. A theme can use the Helix name as a `semanticTokenColors` key:

```jsonc
"semanticTokenColors": {
  "function:nix": "#6DB3F2",
  "variable:nix": "#DCDFE4",
  "variable.other.member:nix": "#F7768E"
}
```

Themes without semantic rules fall back to TextMate scopes, such as
`entity.name.function` for `function` and `variable.other.member` for
members.

Overlapping captures resolve as in Helix. On the same range, the highest
pattern index wins. A nested range colors its own text.

## Updating the grammar and query

`scripts/refresh.sh` rebuilds `grammar/tree-sitter-nix.wasm` and copies
`queries/highlights.scm` from nixpkgs' Helix. It takes an optional nixpkgs
flake ref to match a specific Helix build:

```sh
scripts/refresh.sh github:NixOS/nixpkgs/<rev>
```

`SOURCES` records the Helix version and grammar revision.

## Building

```sh
nix develop
npm ci
npm test
vsce package
code --install-extension helix-nix-vscode-*.vsix
```

## Licenses

MIT, except `queries/highlights.scm`, which comes from Helix under MPL-2.0.
See `queries/NOTICE`.
