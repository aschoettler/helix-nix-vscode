# Helix Nix Highlighting

Nix highlighting that matches the Helix editor, built on tree-sitter.

- Colors by syntax role: in `types.nullOr types.str`, the function `nullOr` and the attribute `str` get different colors.
- Colors code inside Nix strings: bash in build phases and activation scripts, Python, JSON, TOML, regex and markdown. Nix interpolations inside them keep their Nix colors.
- Works alongside [Nix IDE](https://marketplace.visualstudio.com/items?itemName=jnoortheen.nix-ide), which it installs as a dependency.

## Colors

Token names are Helix's capture names with dashes, such as `function`,
`variable-other-member` and `markup-heading`. A rule for `variable` also
covers `variable-other-member`. Themes without rules for these tokens fall
back to their usual colors.

To change a color, add a rule in `settings.json`:

```jsonc
{
  "editor.semanticTokenColorCustomizations": {
    "rules": {
      "variable-other-member:nix": "#F7768E"
    }
  }
}
```

Theme authors use the same keys under `semanticTokenColors`.

## License

MIT, except the Helix queries and metadata under `languages/`, which are
MPL-2.0. See [NOTICE](NOTICE). Building from source: [DEVELOPMENT.md](DEVELOPMENT.md).
