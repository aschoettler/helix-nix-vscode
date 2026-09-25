{ config, lib, ... }:
let
  inherit (lib) mkIf mkOption types;
  cfg = config.services.example;
in
{
  options.services.example.hostName = mkOption {
    type = types.nullOr types.str;
    default = null;
  };
  config = mkIf cfg.enable {
    networking.hostName = mkIf (cfg.hostName != null) cfg.hostName;
    a = builtins.map toString [ 1 true ];
    b = "é😀 ${cfg.name} \n";
    c = import ./x.nix;
  };
}
