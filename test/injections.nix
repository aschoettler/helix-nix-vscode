{
  testScript = ''
    machine.succeed("true")
  '';
  script = pkgs.writers.writePython3 "check" { } ''
    import os
    def check(machine, retries=3):
        machine.wait_for_unit("sshd")
        return os.path.join(machine, retries)
  '';
  a = builtins.fromJSON ''
    { "key": [1, true, null] }
  '';
  b = builtins.fromTOML ''
    [section]
    name = "x"
  '';
  c = builtins.match ''^([a-z]+)-[0-9]*$'' s;
  d = /* markdown */ ''
# Title
Some **bold** and `code`.
```bash
echo hi
```
'';
}
