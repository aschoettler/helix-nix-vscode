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
      packages = forAllSystems (pkgs: {
        # The grammar and query nixpkgs' Helix ships, as one matched pair.
        # scripts/refresh.sh copies this into the repo.
        assets = pkgs.runCommand "helix-nix-vscode-assets" {
          nativeBuildInputs = [
            pkgs.tree-sitter
            pkgs.lld
          ];
          wasiCc = pkgs.pkgsCross.wasi32.stdenv.cc;
          grammarSrc = pkgs.helix.tree-sitter-grammars.tree-sitter-nix.src;
          grammarRev = pkgs.helix.tree-sitter-grammars.tree-sitter-nix.src.rev;
          helixVersion = pkgs.helix.version;
        } ''
          export HOME=$TMPDIR
          # tree-sitter looks for a bare `clang` under $TREE_SITTER_WASI_SDK_PATH/bin.
          mkdir -p wasi-sdk/bin
          ln -s $wasiCc/bin/${pkgs.pkgsCross.wasi32.stdenv.cc.targetPrefix}clang wasi-sdk/bin/clang
          export TREE_SITTER_WASI_SDK_PATH=$PWD/wasi-sdk
          cp -r $grammarSrc grammar && chmod -R u+w grammar
          mkdir -p $out/grammar $out/queries
          tree-sitter build --wasm -o $out/grammar/tree-sitter-nix.wasm grammar
          cp ${pkgs.helix.runtime}/queries/nix/highlights.scm $out/queries/highlights.scm
          printf 'helix %s\ntree-sitter-nix %s\n' "$helixVersion" "$grammarRev" > $out/SOURCES
        '';
      });

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
