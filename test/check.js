// Fails when package.json's token declarations drift from the queries, or
// when a sample stops resolving to the captures Helix gives it.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { createHighlighter } = require('../highlight');

const { declare } = require('../scripts/declare-tokens');

(async () => {
  const h = await createHighlighter();
  // package.json must match what the queries emit.
  const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
  const want = declare(h.legend);
  assert.deepStrictEqual(pkg.contributes.semanticTokenTypes, want.semanticTokenTypes, 'run scripts/declare-tokens.js');
  assert.deepStrictEqual(pkg.contributes.semanticTokenScopes, want.semanticTokenScopes, 'run scripts/declare-tokens.js');

  const text = '{\n  x = mkOption {\n    type = types.nullOr types.str;\n    y = mkIf cfg.enable { };\n  };\n}\n';
  const lines = text.split('\n');
  const got = {};
  for (const [line, ch, len, type] of await h.tokens(text)) {
    got[`${line}:${lines[line].substr(ch, len)}`] = h.legend.types[type];
  }
  const expect = {
    '1:mkOption': 'function',
    '2:type': 'variable-other-member',
    '2:types': 'variable',
    '2:nullOr': 'function',
    '2:str': 'variable-other-member',
    '3:mkIf': 'function',
    '3:cfg': 'variable',
    '3:enable': 'variable-other-member',
  };
  for (const [k, v] of Object.entries(expect)) assert.strictEqual(got[k], v, k);

  // A `postActivation` string is bash per Helix's injection query. The Nix
  // interpolation inside it stays Nix.
  const script = '{\n  a.postActivation = \'\'\n    mkdir -p "${pkgs.x}/bin"\n  \'\';\n}\n';
  const scriptLines = script.split('\n');
  const inScript = {};
  for (const [line, ch, len, type] of await h.tokens(script)) {
    inScript[`${line}:${scriptLines[line].substr(ch, len)}`] = h.legend.types[type];
  }
  const expectScript = {
    '2:mkdir': 'function',
    '2:-p': 'variable-parameter',
    '2:pkgs': 'variable',
    '2:x': 'variable-other-member',
  };
  for (const [k, v] of Object.entries(expectScript)) assert.strictEqual(inScript[k], v, k);

  // Python resolves locals: a parameter keeps its color where it is used.
  // Markdown injects its inline grammar, and a fenced block injects bash.
  const nested = fs.readFileSync(path.join(__dirname, 'injections.nix'), 'utf8');
  const nestedLines = nested.split('\n');
  const inNested = {};
  for (const [line, ch, len, type] of await h.tokens(nested)) {
    inNested[`${line}:${nestedLines[line].substr(ch, len)}`] = h.legend.types[type];
  }
  const expectNested = {
    '3:machine': 'variable-parameter',
    '2:os': 'namespace',
    '12:name': 'variable-other-member',
    '16: Title': 'markup-heading-1',
    '17:bold': 'markup-bold',
    '19:echo': 'function-builtin',
  };
  for (const [k, v] of Object.entries(expectNested)) assert.strictEqual(inNested[k], v, k);
  console.log('ok');
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
