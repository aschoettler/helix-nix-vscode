// Runs Helix's highlight and injection queries over tree-sitter parses and
// resolves overlapping captures the way Helix does. No VS Code dependency, so
// tests can drive it from plain Node.

const fs = require('fs');
const path = require('path');
const { Parser, Language, Query } = require('web-tree-sitter');

const LANGUAGES = path.join(__dirname, 'languages');
const MAX_INJECTION_DEPTH = 4;

// Helix's shebang pattern: the interpreter name after an optional path and `env`.
const SHEBANG = /#!\s*(?:\S*[/\\](?:env\s+(?:-\S+\s+)*)?)?([^\s.\d]+)/;

// A Helix capture name maps to a VS Code token type plus modifiers.
// `variable.other.member` becomes type `variable`, modifiers `other member`.
// Theme selectors are `type.modifier...`, so the Helix name works as a key.
function splitCapture(name) {
  const [type, ...modifiers] = name.split('.');
  return { type, modifiers };
}

async function loadLanguages() {
  const meta = JSON.parse(fs.readFileSync(path.join(LANGUAGES, 'languages.json'), 'utf8'));
  const languages = new Map();
  for (const m of meta) {
    const dir = path.join(LANGUAGES, m.name);
    const language = await Language.load(path.join(dir, 'grammar.wasm'));
    const readQuery = (file) => {
      const p = path.join(dir, file);
      return fs.existsSync(p) ? new Query(language, fs.readFileSync(p, 'utf8')) : null;
    };
    languages.set(m.name, {
      ...m,
      injectionRegex: m.injectionRegex ? new RegExp(m.injectionRegex) : null,
      language,
      highlights: readQuery('highlights.scm'),
      injections: readQuery('injections.scm'),
    });
  }
  return languages;
}

// Helix resolves an injection language from a name set by the query, or from
// text the query captured: a language marker, a filename, or a shebang.
function resolveLanguage(languages, marker) {
  const all = [...languages.values()];
  switch (marker.kind) {
    case 'name':
      return languages.get(marker.text);
    case 'match':
      return all.find((l) => l.injectionRegex && l.injectionRegex.test(marker.text));
    case 'filename': {
      const base = path.basename(marker.text);
      return all.find((l) => l.fileTypes.some((t) => base === t || base.endsWith(`.${t}`)));
    }
    case 'shebang':
      return all.find((l) => l.shebangs.includes(marker.text));
  }
}

// The text a content node contributes: its range minus its children, unless
// the query says to include them.
function contentRanges(node, includeChildren) {
  const whole = {
    startIndex: node.startIndex,
    endIndex: node.endIndex,
    startPosition: node.startPosition,
    endPosition: node.endPosition,
  };
  if (includeChildren === 'all') return [whole];
  const holes = node.children.filter((c) => includeChildren !== 'unnamed' || c.isNamed);
  const ranges = [];
  let cursor = whole;
  for (const c of holes) {
    if (c.startIndex > cursor.startIndex) {
      ranges.push({ ...cursor, endIndex: c.startIndex, endPosition: c.startPosition });
    }
    cursor = { ...cursor, startIndex: c.endIndex, startPosition: c.endPosition };
  }
  if (cursor.endIndex > cursor.startIndex) ranges.push(cursor);
  return ranges;
}

// Groups the injection query's matches into layers the way Helix does.
// Combined patterns merge every match into one layer per pattern and
// language. A match with several content nodes is one layer. Otherwise each
// content node is its own layer. On an identical node range, the last match
// wins.
function injectionLayers(languages, lang, tree) {
  const query = lang.injections;
  if (!query) return [];
  const byRange = new Map();
  query.matches(tree.rootNode).forEach((match, matchIndex) => {
    const props = match.setProperties || {};
    let marker = null;
    const contents = [];
    for (const { name, node } of match.captures) {
      if (name === 'injection.language') marker = { kind: 'match', text: node.text };
      else if (name === 'injection.filename') marker = { kind: 'filename', text: node.text };
      else if (name === 'injection.shebang') {
        const firstLines = node.text.split('\n').slice(0, 2).join('\n');
        const m = SHEBANG.exec(firstLines);
        marker = m ? { kind: 'shebang', text: m[1] } : null;
      }
      if (name === 'injection.content') contents.push(node);
    }
    if (!marker && props['injection.language']) {
      marker = { kind: 'name', text: props['injection.language'] };
    }
    const target = marker && resolveLanguage(languages, marker);
    if (!target) return;
    const combined = 'injection.combined' in props;
    const include =
      'injection.include-children' in props
        ? 'all'
        : 'injection.include-unnamed-children' in props
          ? 'unnamed'
          : 'none';
    for (const [i, node] of contents.entries()) {
      if (node.startIndex === node.endIndex) continue;
      const scope = combined
        ? `pattern:${match.patternIndex}:${target.name}`
        : contents.length !== 1
          ? `match:${matchIndex}`
          : `node:${matchIndex}:${i}`;
      byRange.set(`${node.startIndex}-${node.endIndex}`, {
        scope,
        lang: target,
        ranges: contentRanges(node, include),
      });
    }
  });

  const layers = new Map();
  for (const { scope, lang: target, ranges } of byRange.values()) {
    const layer = layers.get(scope) ?? { lang: target, ranges: [] };
    layer.ranges.push(...ranges);
    layers.set(scope, layer);
  }
  for (const layer of layers.values()) layer.ranges.sort((a, b) => a.startIndex - b.startIndex);
  return [...layers.values()];
}

async function createHighlighter() {
  await Parser.init();
  const languages = await loadLanguages();
  const parser = new Parser();

  // One legend across all languages. Each capture name gets a global id.
  const captureIds = new Map();
  const legend = { types: [], modifiers: [] };
  for (const lang of languages.values()) {
    for (const name of lang.highlights?.captureNames ?? []) {
      // `_` captures are query-internal. `none` marks text Helix leaves
      // unhighlighted, so the color underneath shows through.
      if (name.startsWith('_') || name === 'none' || captureIds.has(name)) continue;
      const split = splitCapture(name);
      if (!legend.types.includes(split.type)) legend.types.push(split.type);
      for (const m of split.modifiers) if (!legend.modifiers.includes(m)) legend.modifiers.push(m);
      captureIds.set(name, captureIds.size);
    }
  }
  const encoded = [...captureIds.keys()].map((name) => {
    const split = splitCapture(name);
    let bits = 0;
    for (const m of split.modifiers) bits |= 1 << legend.modifiers.indexOf(m);
    return [legend.types.indexOf(split.type), bits];
  });

  // Paints one layer, then the layers it injects on top of it. `ranges` is
  // null for the document's own layer.
  function paintLayer(owner, text, lang, ranges, depth) {
    parser.setLanguage(lang.language);
    const tree = parser.parse(text, null, ranges ? { includedRanges: ranges } : undefined);

    // Helix's rule: for the same range, the highest pattern index wins, and
    // within one pattern the later capture wins. A nested range colors its
    // own text over the range around it. Painting wide ranges first, then
    // ascending pattern index, gives both.
    const spans = [];
    const captures = lang.highlights ? lang.highlights.captures(tree.rootNode) : [];
    captures.forEach((c, order) => {
      const id = captureIds.get(c.name);
      if (id === undefined) return;
      spans.push({ start: c.node.startIndex, end: c.node.endIndex, pattern: c.patternIndex, order, id });
    });
    const injected = depth < MAX_INJECTION_DEPTH ? injectionLayers(languages, lang, tree) : [];
    // Capture nodes point into the tree, so free it only after reading them.
    tree.delete();

    spans.sort(
      (a, b) =>
        b.end - b.start - (a.end - a.start) ||
        a.start - b.start ||
        a.pattern - b.pattern ||
        a.order - b.order,
    );
    // An injected node can span a gap between its ranges, such as a Nix
    // interpolation inside a bash string. The gap keeps the outer colors.
    for (const s of spans) {
      if (!ranges) {
        owner.fill(s.id, s.start, s.end);
        continue;
      }
      for (const r of ranges) {
        const start = Math.max(s.start, r.startIndex);
        const end = Math.min(s.end, r.endIndex);
        if (start < end) owner.fill(s.id, start, end);
      }
    }

    for (const layer of injected) paintLayer(owner, text, layer.lang, layer.ranges, depth + 1);
  }

  // Emits [line, char, length, typeIndex, modifierBits] runs, split at line
  // ends because VS Code tokens cannot span lines.
  function tokens(text, languageName = 'nix') {
    const owner = new Int32Array(text.length).fill(-1);
    paintLayer(owner, text, languages.get(languageName), null, 0);
    const out = [];
    let line = 0;
    let lineStart = 0;
    let i = 0;
    while (i < text.length) {
      if (text.charCodeAt(i) === 10) {
        line++;
        lineStart = i + 1;
        i++;
        continue;
      }
      const id = owner[i];
      let j = i + 1;
      while (j < text.length && owner[j] === id && text.charCodeAt(j) !== 10) j++;
      if (id !== -1) {
        let end = j;
        if (text.charCodeAt(end - 1) === 13) end--;
        if (end > i) out.push([line, i - lineStart, end - i, ...encoded[id]]);
      }
      i = j;
    }
    return out;
  }

  return { legend, tokens };
}

module.exports = { createHighlighter, splitCapture };
