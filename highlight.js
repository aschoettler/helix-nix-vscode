// Runs Helix's highlight, locals and injection queries over tree-sitter parses
// and resolves overlapping captures the way Helix does. No VS Code
// dependency, so tests can drive it from plain Node.

const fs = require('fs');
const path = require('path');
const { Parser, Language, Query } = require('web-tree-sitter');

const LANGUAGES = path.join(__dirname, 'languages');
// This extension's own query patterns, appended after Helix's.
const OVERRIDES = path.join(__dirname, 'overrides');
const MAX_INJECTION_DEPTH = 4;

// Helix's shebang pattern: the interpreter name after an optional path and `env`.
const SHEBANG = /#!\s*(?:\S*[/\\](?:env\s+(?:-\S+\s+)*)?)?([^\s.\d]+)/;

// A Helix capture name becomes a VS Code token type with dots turned into
// dashes: `variable.other.member` is `variable-other-member`. package.json
// declares each type with its prefix as superType, so a theme rule for
// `variable` also colors `variable-other-member`, like Helix's fallback.
function tokenType(name) {
  return name.replace(/\./g, '-');
}

// Capture names that can become tokens. `_` captures are query-internal,
// `local.*` captures drive scope tracking, and `none` marks text Helix leaves
// unhighlighted so the color underneath shows through.
function isHighlight(name) {
  return !name.startsWith('_') && !name.startsWith('local.') && name !== 'none';
}

function readQueryText(dir, file) {
  const p = path.join(dir, file);
  return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : null;
}

// Metadata and query text for every bundled language. Grammars compile on
// first use, so a file only pays for the languages it contains.
function readLanguages() {
  const meta = JSON.parse(fs.readFileSync(path.join(LANGUAGES, 'languages.json'), 'utf8'));
  const languages = new Map();
  for (const m of meta) {
    const dir = path.join(LANGUAGES, m.name);
    languages.set(m.name, {
      ...m,
      dir,
      injectionRegex: m.injectionRegex ? new RegExp(m.injectionRegex) : null,
      highlightsText: readQueryText(dir, 'highlights.scm'),
      injectionsText: [readQueryText(dir, 'injections.scm'), readQueryText(path.join(OVERRIDES, m.name), 'injections.scm')]
        .filter(Boolean)
        .join('\n') || null,
      localsText: readQueryText(dir, 'locals.scm'),
      loaded: null,
    });
  }
  return languages;
}

// Every name a query can emit as a highlight: its own captures, plus the
// highlight a local definition passes to its references.
function highlightNames(lang) {
  const names = new Set();
  for (const text of [lang.highlightsText, lang.localsText]) {
    for (const [, name] of (text ?? '').matchAll(/@([A-Za-z_][\w.-]*)/g)) {
      const def = name.match(/^local\.definition\.(.+)$/);
      if (def) names.add(def[1]);
      else if (isHighlight(name)) names.add(name);
    }
  }
  return names;
}

async function loadLanguage(lang) {
  const language = await Language.load(path.join(lang.dir, 'grammar.wasm'));
  // Helix appends the locals query to the highlight query, so its
  // `local.reference` pattern outranks the highlight patterns.
  const highlightsText = [lang.highlightsText, lang.localsText].filter(Boolean).join('\n');
  lang.loaded = {
    language,
    highlights: highlightsText ? new Query(language, highlightsText) : null,
    locals: lang.localsText ? new Query(language, lang.localsText) : null,
    injections: lang.injectionsText ? new Query(language, lang.injectionsText) : null,
  };
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

// Scopes and definitions from a locals query, as Helix tracks them. A
// reference resolves to a definition in its scope or an inheriting parent,
// if the definition ends before the reference starts.
function buildLocals(query, tree) {
  const root = { start: 0, end: Infinity, parent: null, inherit: false, defs: new Map() };
  const scopes = [root];
  let scope = root;
  for (const match of query.matches(tree.rootNode)) {
    for (const { name, node } of match.captures) {
      while (node.startIndex >= scope.end) scope = scope.parent;
      if (name === 'local.scope') {
        const props = match.setProperties || {};
        scope = {
          start: node.startIndex,
          end: node.endIndex,
          parent: scope,
          inherit: props['local.scope-inherits'] !== 'false',
          defs: new Map(),
        };
        scopes.push(scope);
      } else if (name.startsWith('local.definition.')) {
        scope.defs.set(node.text, {
          highlight: name.slice('local.definition.'.length),
          end: node.endIndex,
        });
      }
    }
  }
  return {
    lookup(node) {
      let inner = root;
      for (const s of scopes) {
        if (s.start <= node.startIndex && node.endIndex <= s.end && s.end - s.start <= inner.end - inner.start) {
          inner = s;
        }
      }
      for (let s = inner; s; s = s.inherit ? s.parent : null) {
        const def = s.defs.get(node.text);
        if (def) return def.end <= node.startIndex ? def : null;
      }
      return null;
    },
  };
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
function injectionLayers(languages, query, tree) {
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
  for (const { scope, lang, ranges } of byRange.values()) {
    const layer = layers.get(scope) ?? { lang, ranges: [] };
    layer.ranges.push(...ranges);
    layers.set(scope, layer);
  }
  for (const layer of layers.values()) layer.ranges.sort((a, b) => a.startIndex - b.startIndex);
  return [...layers.values()];
}

async function createHighlighter() {
  await Parser.init();
  const languages = readLanguages();
  const parser = new Parser();

  // One legend across all languages. Each highlight name gets a global id.
  const captureIds = new Map();
  const legend = { types: [], modifiers: [] };
  for (const lang of languages.values()) {
    for (const name of highlightNames(lang)) {
      if (captureIds.has(name)) continue;
      captureIds.set(name, legend.types.length);
      legend.types.push(tokenType(name));
    }
  }

  // Paints one layer, then the layers it injects on top of it. `ranges` is
  // null for the document's own layer. Injected languages not yet loaded
  // are added to `missing` and skipped.
  function paintLayer(owner, text, lang, ranges, depth, missing) {
    const { language, highlights, locals, injections } = lang.loaded;
    parser.setLanguage(language);
    const tree = parser.parse(text, null, ranges ? { includedRanges: ranges } : undefined);
    const scopes = locals ? buildLocals(locals, tree) : null;

    // Helix's rule: for the same range, the highest pattern index wins, and
    // within one pattern the later capture wins. A nested range colors its
    // own text over the range around it. Painting wide ranges first, then
    // ascending pattern index, gives both.
    const spans = [];
    let order = 0;
    for (const match of highlights ? highlights.matches(tree.rootNode) : []) {
      // With locals, a `(#is-not? local)` pattern does not match a local.
      if (scopes && 'local' in (match.refutedProperties || {})) {
        if (match.captures.some((c) => scopes.lookup(c.node))) continue;
      }
      for (const { name, node } of match.captures) {
        let highlight = name;
        if (name === 'local.reference') {
          const def = scopes && scopes.lookup(node);
          if (!def) continue;
          highlight = def.highlight;
        }
        const id = captureIds.get(highlight);
        if (id === undefined) continue;
        spans.push({ start: node.startIndex, end: node.endIndex, pattern: match.patternIndex, order: order++, id });
      }
    }
    const injected = injections && depth < MAX_INJECTION_DEPTH ? injectionLayers(languages, injections, tree) : [];
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

    for (const layer of injected) {
      if (!layer.lang.loaded) missing.add(layer.lang);
      else paintLayer(owner, text, layer.lang, layer.ranges, depth + 1, missing);
    }
  }

  // Emits [line, char, length, typeIndex, 0] runs, split at line
  // ends because VS Code tokens cannot span lines.
  async function tokens(text, languageName = 'nix') {
    const root = languages.get(languageName);
    if (!root.loaded) await loadLanguage(root);
    let owner;
    for (;;) {
      owner = new Int32Array(text.length).fill(-1);
      const missing = new Set();
      paintLayer(owner, text, root, null, 0, missing);
      if (missing.size === 0) break;
      await Promise.all([...missing].map(loadLanguage));
    }

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
        if (end > i) out.push([line, i - lineStart, end - i, id, 0]);
      }
      i = j;
    }
    return out;
  }

  return { legend, tokens, languages };
}

// Packs absolute [line, char, length, type, modifiers] tokens into VS Code's
// relative encoding: each token's line and start are deltas from the previous.
function encode(tokens) {
  const data = new Uint32Array(tokens.length * 5);
  let prevLine = 0;
  let prevChar = 0;
  tokens.forEach(([line, char, length, type, modifiers], i) => {
    data[i * 5] = line - prevLine;
    data[i * 5 + 1] = line === prevLine ? char - prevChar : char;
    data[i * 5 + 2] = length;
    data[i * 5 + 3] = type;
    data[i * 5 + 4] = modifiers;
    prevLine = line;
    prevChar = char;
  });
  return data;
}

module.exports = { createHighlighter, tokenType, encode };
