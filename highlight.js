// Runs Helix's highlight query over a tree-sitter parse and resolves
// overlapping captures the way Helix does. No VS Code dependency, so tests
// can drive it from plain Node.

const fs = require('fs');
const path = require('path');
const { Parser, Language, Query } = require('web-tree-sitter');

const GRAMMAR = path.join(__dirname, 'grammar', 'tree-sitter-nix.wasm');
const QUERY = path.join(__dirname, 'queries', 'highlights.scm');

// A Helix capture name maps to a VS Code token type plus modifiers.
// `variable.other.member` becomes type `variable`, modifiers `other member`.
// Theme selectors are `type.modifier...`, so the Helix name works as a key.
function splitCapture(name) {
  const [type, ...modifiers] = name.split('.');
  return { type, modifiers };
}

function buildLegend(captureNames) {
  const types = [];
  const modifiers = [];
  for (const name of captureNames) {
    if (name.startsWith('_')) continue;
    const split = splitCapture(name);
    if (!types.includes(split.type)) types.push(split.type);
    for (const m of split.modifiers) if (!modifiers.includes(m)) modifiers.push(m);
  }
  return { types, modifiers };
}

async function createHighlighter() {
  await Parser.init();
  const language = await Language.load(GRAMMAR);
  const parser = new Parser();
  parser.setLanguage(language);
  const query = new Query(language, fs.readFileSync(QUERY, 'utf8'));
  const legend = buildLegend(query.captureNames);

  // Encode each capture once as [typeIndex, modifierBitset].
  const encoded = query.captureNames.map((name) => {
    if (name.startsWith('_')) return null;
    const split = splitCapture(name);
    let bits = 0;
    for (const m of split.modifiers) bits |= 1 << legend.modifiers.indexOf(m);
    return [legend.types.indexOf(split.type), bits];
  });

  // Returns one capture index per UTF-16 code unit, -1 where nothing matched.
  function paint(text) {
    const tree = parser.parse(text);
    const captures = query.captures(tree.rootNode);

    // Helix's rule: for the same range, the highest pattern index wins, and
    // within one pattern the later capture wins. A nested range colors its
    // own text over the range around it. Painting wide ranges first, then
    // ascending pattern index, gives both.
    const spans = [];
    for (let i = 0; i < captures.length; i++) {
      const c = captures[i];
      if (!encoded[query.captureNames.indexOf(c.name)]) continue;
      spans.push({
        start: c.node.startIndex,
        end: c.node.endIndex,
        pattern: c.patternIndex,
        order: i,
        capture: query.captureNames.indexOf(c.name),
      });
    }
    // Capture nodes point into the tree, so free it only after reading them.
    tree.delete();
    spans.sort(
      (a, b) =>
        b.end - b.start - (a.end - a.start) ||
        a.start - b.start ||
        a.pattern - b.pattern ||
        a.order - b.order,
    );

    const owner = new Int32Array(text.length).fill(-1);
    for (const s of spans) owner.fill(s.capture, s.start, s.end);
    return owner;
  }

  // Emits [line, char, length, typeIndex, modifierBits] runs, split at line
  // ends because VS Code tokens cannot span lines.
  function tokens(text) {
    const owner = paint(text);
    const out = [];
    let line = 0;
    let lineStart = 0;
    let i = 0;
    while (i < text.length) {
      const ch = text.charCodeAt(i);
      if (ch === 10) {
        line++;
        lineStart = i + 1;
        i++;
        continue;
      }
      const cap = owner[i];
      let j = i + 1;
      while (j < text.length && owner[j] === cap && text.charCodeAt(j) !== 10) j++;
      if (cap !== -1) {
        let end = j;
        if (text.charCodeAt(end - 1) === 13) end--;
        if (end > i) out.push([line, i - lineStart, end - i, ...encoded[cap]]);
      }
      i = j;
    }
    return out;
  }

  return { legend, tokens, captureNames: query.captureNames };
}

module.exports = { createHighlighter, splitCapture };
