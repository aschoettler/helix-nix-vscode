// Declares every token type the bundled queries can emit in package.json:
// each type with its dash prefix as superType, down to a first segment, and
// the TextMate scope of the same Helix name for themes without semantic
// rules. refresh.sh runs this.
const fs = require('fs');
const path = require('path');
const { createHighlighter } = require('../highlight');

// VS Code's built-in token types need no declaration.
const STANDARD_TYPES = new Set([
  'namespace', 'class', 'enum', 'interface', 'struct', 'typeParameter', 'type', 'parameter',
  'variable', 'property', 'enumMember', 'decorator', 'event', 'function', 'method', 'macro',
  'label', 'comment', 'string', 'keyword', 'number', 'regexp', 'operator',
]);

function declare(legend) {
  const types = new Map();
  for (const type of legend.types) {
    const parts = type.split('-');
    for (let i = 1; i <= parts.length; i++) {
      const id = parts.slice(0, i).join('-');
      if (STANDARD_TYPES.has(id) || types.has(id)) continue;
      const decl = { id, description: `Helix capture \`${parts.slice(0, i).join('.')}\`.` };
      if (i > 1) decl.superType = parts.slice(0, i - 1).join('-');
      types.set(id, decl);
    }
  }
  const scopes = {};
  for (const type of legend.types) scopes[type] = [type.replace(/-/g, '.')];
  return {
    semanticTokenTypes: [...types.values()],
    semanticTokenScopes: [{ language: 'nix', scopes }],
  };
}

if (require.main === module) {
  (async () => {
    const { legend } = await createHighlighter();
    const file = path.join(__dirname, '..', 'package.json');
    const pkg = JSON.parse(fs.readFileSync(file, 'utf8'));
    const { semanticTokenTypes, semanticTokenScopes } = declare(legend);
    pkg.contributes.semanticTokenTypes = semanticTokenTypes;
    delete pkg.contributes.semanticTokenModifiers;
    pkg.contributes.semanticTokenScopes = semanticTokenScopes;
    fs.writeFileSync(file, `${JSON.stringify(pkg, null, 2)}\n`);
  })();
}

module.exports = { declare };
