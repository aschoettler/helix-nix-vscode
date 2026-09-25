# Helix Nix Highlighting

Colors Nix in VS Code the way Helix does. The extension parses with
tree-sitter-nix, runs Helix's `highlights.scm`, and hands the result to VS Code
as semantic tokens. A TextMate grammar can't tell `nullOr` in
`types.nullOr types.str` from `str`; the parse tree can.

It also runs Helix's Nix `injections.scm`, so a string Helix treats as
another language is colored as that language. For example, `postActivation`,
`buildPhase` and `writeShellScript` strings are colored as bash. Nix
interpolations inside them keep their Nix colors. Injections work for the
languages bundled under `languages/`: Nix and bash.

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
injection language, add it to `languages` in `flake.nix` and refresh.

## Building

```sh
nix develop
npm ci
npm test
vsce package
code --install-extension helix-nix-vscode-*.vsix
```

## Licenses

MIT, except the Helix queries and metadata under `languages/`, which are
MPL-2.0. See `NOTICE`.
