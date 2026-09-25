// Fails when the query uses a capture segment package.json doesn't declare,
// or when a sample stops resolving to the captures Helix gives it.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { createHighlighter } = require('../highlight');

const STANDARD_TYPES = new Set([
  'namespace', 'class', 'enum', 'interface', 'struct', 'typeParameter', 'type', 'parameter',
  'variable', 'property', 'enumMember', 'decorator', 'event', 'function', 'method', 'macro',
  'label', 'comment', 'string', 'keyword', 'number', 'regexp', 'operator',
]);

(async () => {
  const h = await createHighlighter();
  const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
  const declaredTypes = new Set(pkg.contributes.semanticTokenTypes.map((t) => t.id));
  const declaredMods = new Set(pkg.contributes.semanticTokenModifiers.map((m) => m.id));
  for (const t of h.legend.types) {
    assert(STANDARD_TYPES.has(t) || declaredTypes.has(t), `undeclared token type: ${t}`);
  }
  for (const m of h.legend.modifiers) assert(declaredMods.has(m), `undeclared modifier: ${m}`);

  const text = '{\n  x = mkOption {\n    type = types.nullOr types.str;\n    y = mkIf cfg.enable { };\n  };\n}\n';
  const lines = text.split('\n');
  const got = {};
  for (const [line, ch, len, type, bits] of h.tokens(text)) {
    const mods = h.legend.modifiers.filter((_, i) => bits & (1 << i));
    got[`${line}:${lines[line].substr(ch, len)}`] = [h.legend.types[type], ...mods].join('.');
  }
  const expect = {
    '1:mkOption': 'function',
    '2:type': 'variable.other.member',
    '2:types': 'variable',
    '2:nullOr': 'function',
    '2:str': 'variable.other.member',
    '3:mkIf': 'function',
    '3:cfg': 'variable',
    '3:enable': 'variable.other.member',
  };
  for (const [k, v] of Object.entries(expect)) assert.strictEqual(got[k], v, k);

  // A `postActivation` string is bash per Helix's injection query. The Nix
  // interpolation inside it stays Nix.
  const script = '{\n  a.postActivation = \'\'\n    mkdir -p "${pkgs.x}/bin"\n  \'\';\n}\n';
  const scriptLines = script.split('\n');
  const inScript = {};
  for (const [line, ch, len, type, bits] of h.tokens(script)) {
    const mods = h.legend.modifiers.filter((_, i) => bits & (1 << i));
    inScript[`${line}:${scriptLines[line].substr(ch, len)}`] = [h.legend.types[type], ...mods].join('.');
  }
  const expectScript = {
    '2:mkdir': 'function',
    '2:-p': 'variable.parameter',
    '2:pkgs': 'variable',
    '2:x': 'variable.other.member',
  };
  for (const [k, v] of Object.entries(expectScript)) assert.strictEqual(inScript[k], v, k);
  console.log('ok');
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
