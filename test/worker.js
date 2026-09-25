// Drives worker.js the way the extension does and checks its encoded tokens
// against the in-process highlighter. Prints the worker's resident memory.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { execFileSync, fork } = require('child_process');
const { createHighlighter, encode } = require('../highlight');

function request(proc, id, message) {
  return new Promise((resolve, reject) => {
    const onMessage = (reply) => {
      if (reply.id !== id) return;
      proc.off('message', onMessage);
      if (reply.error) reject(new Error(reply.error));
      else resolve(reply);
    };
    proc.on('message', onMessage);
    proc.send({ id, ...message });
  });
}

(async () => {
  const proc = fork(path.join(__dirname, '..', 'worker.js'), [], {
    execArgv: ['--liftoff-only'],
    serialization: 'advanced',
  });
  const h = await createHighlighter();
  const { legend } = await request(proc, 0, { type: 'legend' });
  assert.deepStrictEqual(legend, h.legend);

  const files = [path.join(__dirname, 'fixture.nix'), path.join(__dirname, 'injections.nix')];
  if (process.argv[2]) files.push(process.argv[2]);
  let id = 1;
  for (const file of files) {
    const text = fs.readFileSync(file, 'utf8');
    const { data } = await request(proc, id++, { type: 'tokens', text });
    assert.deepStrictEqual(data, encode(await h.tokens(text)), file);
  }
  const rss = execFileSync('ps', ['-o', 'rss=', '-p', String(proc.pid)]).toString().trim();
  console.log(`ok (worker rss ${Math.round(rss / 1024)} MB)`);
  proc.kill();
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
