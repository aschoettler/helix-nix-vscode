const path = require('path');
const { fork } = require('child_process');
const vscode = require('vscode');

// Runs worker.js in a child process and matches replies to requests. A
// crashed worker restarts on the next request.
class Worker {
  constructor() {
    this.proc = null;
    this.nextId = 0;
    this.pending = new Map();
  }

  request(message) {
    if (!this.proc) this.start();
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.proc.send({ id, ...message });
    });
  }

  start() {
    const proc = fork(path.join(__dirname, 'worker.js'), [], {
      execArgv: ['--liftoff-only'],
      serialization: 'advanced',
    });
    proc.on('message', ({ id, error, ...reply }) => {
      const p = this.pending.get(id);
      if (!p) return;
      this.pending.delete(id);
      if (error) p.reject(new Error(error));
      else p.resolve(reply);
    });
    proc.on('exit', () => {
      if (this.proc === proc) this.proc = null;
      for (const p of this.pending.values()) p.reject(new Error('highlighter worker exited'));
      this.pending.clear();
    });
    this.proc = proc;
  }

  dispose() {
    if (this.proc) this.proc.kill();
    this.proc = null;
  }
}

async function activate(context) {
  const worker = new Worker();
  context.subscriptions.push(worker);

  const { legend: names } = await worker.request({ type: 'legend' });
  const legend = new vscode.SemanticTokensLegend(names.types, names.modifiers);

  const provider = {
    async provideDocumentSemanticTokens(document) {
      const { data } = await worker.request({ type: 'tokens', text: document.getText() });
      return new vscode.SemanticTokens(data);
    },
  };

  context.subscriptions.push(
    vscode.languages.registerDocumentSemanticTokensProvider({ language: 'nix' }, provider, legend),
  );
}

function deactivate() {}

module.exports = { activate, deactivate };
