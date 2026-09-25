; Appended after Helix's nix injections.scm. On an identical range the last
; match wins, so these patterns take precedence over Helix's.

; testScript is Python. Helix's bash pattern for `*Script` attributes also
; matches it and, coming later, would win.
((binding
   attrpath: (attrpath (identifier) @_path)
   expression: (indented_string_expression
     (string_fragment) @injection.content))
 (#match? @_path "(^|\\.)testScript$")
 (#set! injection.language "python")
 (#set! injection.combined))
