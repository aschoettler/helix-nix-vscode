{
  description = "Helix's tree-sitter Nix highlighting as VS Code semantic tokens";

  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixpkgs-unstable";

  outputs =
    { self, nixpkgs }:
    let
      systems = [
        "aarch64-darwin"
        "x86_64-darwin"
        "aarch64-linux"
        "x86_64-linux"
      ];
      forAllSystems = f: nixpkgs.lib.genAttrs systems (system: f nixpkgs.legacyPackages.${system});
    in
    {
      packages = forAllSystems (
        pkgs:
        let
          # Languages this extension can highlight: Nix itself, plus languages
          # Helix's Nix injection query embeds in strings.
          languages = [
            "nix"
            "bash"
          ];
          grammar = name: pkgs.helix.tree-sitter-grammars."tree-sitter-${name}";
          wasiCc = pkgs.pkgsCross.wasi32.stdenv.cc;
        in
        {
          # Grammars and queries from nixpkgs' Helix, as matched pairs, plus
          # Helix's metadata for resolving injection languages.
          # scripts/refresh.sh copies this into the repo.
          assets = pkgs.runCommand "helix-nix-vscode-assets" {
            nativeBuildInputs = [
              pkgs.tree-sitter
              pkgs.lld
              pkgs.yq-go
            ];
            helixVersion = pkgs.helix.version;
          } ''
            export HOME=$TMPDIR
            # tree-sitter looks for a bare `clang` under $TREE_SITTER_WASI_SDK_PATH/bin.
            mkdir -p wasi-sdk/bin
            ln -s ${wasiCc}/bin/${wasiCc.targetPrefix}clang wasi-sdk/bin/clang
            export TREE_SITTER_WASI_SDK_PATH=$PWD/wasi-sdk

            echo "helix $helixVersion" > sources
            ${pkgs.lib.concatMapStrings (name: ''
              dir=$out/languages/${name}
              mkdir -p $dir
              cp -r ${(grammar name).src} src-${name} && chmod -R u+w src-${name}
              tree-sitter build --wasm -o $dir/grammar.wasm src-${name}/${
                if (grammar name).location == null then "" else (grammar name).location
              }
              for q in highlights injections; do
                if [ -e ${pkgs.helix.runtime}/queries/${name}/$q.scm ]; then
                  cp ${pkgs.helix.runtime}/queries/${name}/$q.scm $dir/
                fi
              done
              echo "tree-sitter-${name} ${(grammar name).src.rev}" >> sources
            '') languages}

            yq -p toml -o json '[.language[] | select(.name == (${
              pkgs.lib.concatMapStringsSep ", " (n: ''"${n}"'') languages
            } )) | {"name": .name, "injectionRegex": .injection-regex, "shebangs": (.shebangs // []), "fileTypes": [(.file-types // [])[] | select(type == "!!str")]}]' \
              ${pkgs.helix-unwrapped.src}/languages.toml > $out/languages/languages.json
            cp sources $out/SOURCES
          '';
        }
      );

      devShells = forAllSystems (pkgs: {
        default = pkgs.mkShell {
          packages = [
            pkgs.nodejs
            pkgs.vsce
          ];
        };
      });
    };
}
