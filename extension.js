const vscode = require('vscode');
const { createHighlighter } = require('./highlight');

async function activate(context) {
  const highlighter = await createHighlighter();
  const legend = new vscode.SemanticTokensLegend(
    highlighter.legend.types,
    highlighter.legend.modifiers,
  );

  const provider = {
    provideDocumentSemanticTokens(document) {
      const builder = new vscode.SemanticTokensBuilder(legend);
      for (const t of highlighter.tokens(document.getText())) builder.push(...t);
      return builder.build();
    },
  };

  context.subscriptions.push(
    vscode.languages.registerDocumentSemanticTokensProvider({ language: 'nix' }, provider, legend),
  );
}

function deactivate() {}

module.exports = { activate, deactivate };
