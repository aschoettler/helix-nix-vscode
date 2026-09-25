# Helix Nix Highlighting

Colors Nix in VS Code the way Helix does. The extension parses with
tree-sitter-nix, runs Helix's `highlights.scm`, and hands the result to VS Code
as semantic tokens. A TextMate grammar can't tell `nullOr` in
`types.nullOr types.str` from `str`; the parse tree can.

It also runs Helix's injection queries, so a string Helix treats as another
language is colored as that language. For example, `postActivation`,
`buildPhase` and `writeShellScript` strings are colored as bash, and
`builtins.fromJSON` strings as JSON. Nix interpolations inside them keep their
Nix colors. Injections work for the languages bundled under `languages/`:
Nix, bash, Python, JSON, TOML, regex and markdown. Python resolves locals as
Helix does, so a parameter keeps its color where it is used.

It needs [Nix IDE](https://marketplace.visualstudio.com/items?itemName=jnoortheen.nix-ide),
which provides the `nix` language, the language server, and the base
TextMate colors. This extension only adds the semantic token layer. It turns
on `editor.semanticHighlighting.enabled` for Nix files only.

## Theme keys

Each Helix capture name is a token type with dots turned into dashes:
`variable.other.member` is `variable-other-member`. Every type declares its
prefix as `superType`, so a theme rule for `variable` also colors
`variable-other-member`, and the most specific rule wins, as in Helix.

```jsonc
"semanticTokenColors": {
  "function:nix": "#6DB3F2",
  "variable:nix": "#DCDFE4",
  "variable-other-member:nix": "#F7768E",
  "markup-heading:nix": { "foreground": "#F7768E", "bold": true }
}
```

Themes without semantic rules fall back to the TextMate scope of the same
Helix name, such as `variable.other.member` or `markup.heading`.
`scripts/declare-tokens.js` generates these declarations from the queries.

Overlapping captures resolve as in Helix. On the same range, the highest
pattern index wins. A nested range colors its own text.

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

## Licenses

MIT, except the Helix queries and metadata under `languages/`, which are
MPL-2.0. See `NOTICE`.
