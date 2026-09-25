// Prints each token as `text=capture` per line, or checks expectations.
const fs = require('fs');
const path = require('path');
const { createHighlighter } = require('../highlight');

async function render(h, text) {
  const lines = text.split('\n');
  const rows = [];
  for (const [line, ch, len, type, bits] of await h.tokens(text)) {
    const name = h.legend.types[type];
    rows[line] = (rows[line] || []).concat(`${lines[line].substr(ch, len)}=${name}`);
  }
  return rows;
}

(async () => {
  const h = await createHighlighter();
  const file = process.argv[2] || path.join(__dirname, 'fixture.nix');
  const text = fs.readFileSync(file, 'utf8');
  if (process.argv[3] === 'time') {
    const t0 = performance.now();
    const n = (await h.tokens(text)).length;
    console.log(`${n} tokens, ${text.length} chars, ${(performance.now() - t0).toFixed(1)} ms`);
    const t1 = performance.now();
    await h.tokens(text);
    console.log(`second run ${(performance.now() - t1).toFixed(1)} ms`);
    return;
  }
  console.log(JSON.stringify(h.legend));
  (await render(h, text)).forEach((r, i) => r && console.log(i + 1, r.filter((x) => !/=punctuation/.test(x)).join('  ')));
})();
