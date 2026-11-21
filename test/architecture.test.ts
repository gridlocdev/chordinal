// The rules of the code's shape, checked over the source: the layers, the pure engine, the desktop bridge, the store,
// the keys and commands, and no way out of the type checker. Each failure says how to fix it.
//
// test/architecture-exceptions.json lists the type escapes (`any`, a ts comment that silences the checker, a lint
// switch-off) that are meant, each with its reason. test/architecture-baseline.json lists breaks of the other rules
// that were there before the rule; it only ever shrinks. Both count per file, and an entry for more than the file has
// fails too, so the lists stay true.
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { builtinModules } from 'node:module';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SKIP_DIRS = new Set(['node_modules', 'dist', 'out', 'release', 'build', 'fixtures']);
const SOURCE = /\.(ts|tsx|mts|cts)$/;

/** the layers: which packages each may import (lowest first) */
const LAYERS: Record<string, readonly string[]> = {
  lib: [],
  audio: ['lib'],
  daw: ['lib'],
  composer: ['lib', 'audio', 'daw'],
  sketch: ['lib', 'daw'],
  playback: ['lib', 'audio', 'daw', 'sketch'],
  ui: ['lib', 'audio', 'daw', 'composer', 'sketch', 'playback'],
  web: ['lib', 'audio', 'daw', 'composer', 'sketch', 'playback', 'ui'],
  desktop: ['audio', 'ui'],
  cli: ['lib', 'audio', 'daw', 'composer', 'playback'],
};
/** the engine: no browser, no Node, no Preact */
const PURE = ['lib', 'audio', 'daw', 'composer', 'sketch'];
const ENGINE_GLOBALS = new Set([
  'window',
  'document',
  'navigator',
  'localStorage',
  'sessionStorage',
  'indexedDB',
  'process',
  'AudioContext',
  'OfflineAudioContext',
]);
const NODE_MODULES = new Set(builtinModules);

/** where the desktop bridge's global may be named */
const BRIDGE_FILES = ['packages/ui/src/platform/native-bridge.ts', 'apps/desktop/src/preload.ts'];
/** where projects are reached: the store and the platform's adapters */
const STORE_DIRS = ['packages/ui/src/store/', 'packages/ui/src/platform/'];
/** the only listeners for keys on the window: the shortcuts and the piano roll's musical typing */
const KEY_LISTENERS = ['apps/web/src/main.tsx', 'packages/ui/src/live.ts'];

interface Source {
  /** the path from the repo's root, with / */
  path: string;
  /** the package or app it belongs to (daw, ui, web, desktop, cli), or `test` for the root's tests */
  part: string;
  /** under the part's src/ (not a test) */
  isSrc: boolean;
  text: string;
  file: ts.SourceFile;
}

function walk(dir: string, out: string[]): void {
  if (!existsSync(dir)) return;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) walk(join(dir, entry.name), out);
    } else if (SOURCE.test(entry.name) && !entry.name.endsWith('.d.ts')) out.push(join(dir, entry.name));
  }
}

function loadSources(): Source[] {
  const files: string[] = [];
  for (const group of ['packages', 'apps'])
    for (const part of readdirSync(join(ROOT, group))) walk(join(ROOT, group, part), files);
  walk(join(ROOT, 'test'), files);
  return files.map((abs) => {
    const path = relative(ROOT, abs).split(sep).join('/');
    const [group, part = '', area] = path.split('/');
    const text = readFileSync(abs, 'utf8');
    const kind = abs.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
    return {
      path,
      part: group === 'test' ? 'test' : part,
      isSrc: group !== 'test' && area === 'src',
      text,
      file: ts.createSourceFile(abs, text, ts.ScriptTarget.Latest, true, kind),
    };
  });
}

const sources = loadSources();

interface Import {
  spec: string;
  typeOnly: boolean;
  line: number;
}

const lineOf = (s: Source, node: ts.Node) =>
  s.file.getLineAndCharacterOfPosition(node.getStart(s.file)).line + 1;

function visit(node: ts.Node, fn: (node: ts.Node) => void): void {
  fn(node);
  ts.forEachChild(node, (child) => visit(child, fn));
}

function importsOf(s: Source): Import[] {
  const out: Import[] = [];
  visit(s.file, (node) => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      const clause = node.importClause;
      const typeOnly =
        !!clause &&
        (clause.isTypeOnly ||
          (!clause.name &&
            !!clause.namedBindings &&
            ts.isNamedImports(clause.namedBindings) &&
            clause.namedBindings.elements.length > 0 &&
            clause.namedBindings.elements.every((e) => e.isTypeOnly)));
      out.push({ spec: node.moduleSpecifier.text, typeOnly, line: lineOf(s, node) });
    } else if (
      ts.isExportDeclaration(node) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      out.push({ spec: node.moduleSpecifier.text, typeOnly: node.isTypeOnly, line: lineOf(s, node) });
    } else if (
      ts.isCallExpression(node) &&
      (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(node.expression) && node.expression.text === 'require')) &&
      node.arguments[0] &&
      ts.isStringLiteralLike(node.arguments[0])
    ) {
      out.push({ spec: node.arguments[0].text, typeOnly: false, line: lineOf(s, node) });
    } else if (ts.isImportTypeNode(node)) {
      const arg = node.argument;
      if (ts.isLiteralTypeNode(arg) && ts.isStringLiteral(arg.literal))
        out.push({ spec: arg.literal.text, typeOnly: true, line: lineOf(s, node) });
    }
  });
  return out;
}

/** an identifier used as a value or a name in its own right, not a property's name or a declaration's */
function isFreeName(node: ts.Identifier): boolean {
  const p = node.parent;
  if (ts.isPropertyAccessExpression(p) && p.name === node) return false;
  if (
    (ts.isPropertyAssignment(p) || ts.isPropertySignature(p) || ts.isPropertyDeclaration(p)) &&
    p.name === node
  )
    return false;
  if ((ts.isMethodDeclaration(p) || ts.isMethodSignature(p)) && p.name === node) return false;
  if (ts.isQualifiedName(p) && p.right === node) return false;
  if (ts.isImportSpecifier(p) || ts.isExportSpecifier(p)) return false;
  if ((ts.isVariableDeclaration(p) || ts.isParameter(p) || ts.isBindingElement(p)) && p.name === node)
    return false;
  if (ts.isJsxAttribute(p)) return false;
  return true;
}

/** `globalThis.window` and the like: the global's name, or null */
function globalProperty(node: ts.Node): string | null {
  if (
    ts.isPropertyAccessExpression(node) &&
    ts.isIdentifier(node.expression) &&
    ['globalThis', 'window', 'self'].includes(node.expression.text)
  )
    return node.name.text;
  return null;
}

interface Break {
  rule: string;
  path: string;
  line: number;
  what: string;
}

const FIXES: Record<string, string> = {
  layers:
    'A package imports only the packages below it: lib; audio and daw on lib; composer on audio and daw; sketch on daw; playback on audio, daw and sketch; ui on all of them; the web app on all of them; the desktop app on audio (and the bridge types of @chordinal/ui/native-bridge); the CLI on the engine, with playback only in src/page/. Move the code down a layer, or pass it in from above.',
  'package deps':
    'A package.json lists only the packages its layer may import (see the layers rule). Take the dependency out, or move the code that needs it up a layer.',
  'relative imports':
    'A relative import stays inside its own package or app. To use another package, import it by name (@chordinal/daw), from its entry point.',
  'composer and sketch':
    'composer and sketch are side by side: neither imports the other. Move what both need down into daw or lib.',
  'pure engine':
    'lib, audio, daw, composer and sketch run anywhere: no node: modules, no Preact, no window, document, navigator, storage, indexedDB, process or AudioContext. Take what the code needs as an argument, or move the code to playback, ui or an app.',
  'desktop bridge':
    'Only packages/ui/src/platform/native-bridge.ts names the desktop bridge (chordinalNative), and only apps/desktop/src/preload.ts sets it. Call nativeBridge() from native-bridge.ts instead.',
  'projects through the store':
    'The UI reaches projects only through the store (packages/ui/src/store/) and the platform adapters (packages/ui/src/platform/): no indexedDB, fetch or nativeBridge().projects elsewhere. Add what you need to the ProjectStore and call that.',
  'key listeners':
    "Keys reach the app in one place: apps/web/src/main.tsx sends them to handleKey (packages/ui/src/keys.ts), and live.ts plays the piano roll's notes. Add a command with a shortcut to the catalog (packages/ui/src/commands.ts) instead of a listener.",
  'command ids':
    'A command named by id (item(), catalog.get, catalog.run, catalog.menuItem) must be registered in the catalog: new CommandCatalog([…]) in packages/ui/src/commands.ts, or catalog.add([…]). Fix the id, or register the command.',
  'named exports':
    "An index file names what it exports (export { a, b } from './x.ts', export type { T } from './x.ts'), so a package's surface is written down and two modules can't quietly export the same name. Replace export * with the names other packages use.",
  'type escapes':
    'No any, @ts-ignore, @ts-expect-error, @ts-nocheck or eslint-disable. Give the value its type (unknown, then narrow it), or fix what the checker or the lint found. If one is truly needed, add it to test/architecture-exceptions.json with the reason.',
};

const isEngineLayer = (part: string) => PURE.includes(part);
const packageOf = (spec: string) => /^@chordinal\/([^/]+)/.exec(spec)?.[1] ?? null;

function findBreaks(): Break[] {
  const out: Break[] = [];
  const add = (rule: string, s: Source, line: number, what: string) =>
    out.push({ rule, path: s.path, line, what });

  // export * hides what a package exports
  for (const s of sources) {
    if (!s.isSrc) continue;
    for (const st of s.file.statements)
      if (ts.isExportDeclaration(st) && !st.exportClause && st.moduleSpecifier)
        add(
          'named exports',
          s,
          s.file.getLineAndCharacterOfPosition(st.getStart()).line + 1,
          st.getText(s.file),
        );
  }

  // the registered command ids
  const registered = new Set<string>();
  for (const s of sources) {
    if (!s.isSrc) continue;
    visit(s.file, (node) => {
      const registers =
        (ts.isNewExpression(node) &&
          ts.isIdentifier(node.expression) &&
          node.expression.text === 'CommandCatalog') ||
        (ts.isCallExpression(node) &&
          ts.isPropertyAccessExpression(node.expression) &&
          node.expression.name.text === 'add' &&
          ts.isIdentifier(node.expression.expression) &&
          node.expression.expression.text === 'catalog');
      if (!registers) return;
      visit(node, (inner) => {
        if (
          ts.isPropertyAssignment(inner) &&
          ts.isIdentifier(inner.name) &&
          inner.name.text === 'id' &&
          ts.isStringLiteralLike(inner.initializer)
        )
          registered.add(inner.initializer.text);
      });
    });
  }

  for (const s of sources) {
    const layer = LAYERS[s.part];
    const inStore = STORE_DIRS.some((d) => s.path.startsWith(d));
    const isUi = s.isSrc && (s.part === 'ui' || s.part === 'web');

    for (const imp of importsOf(s)) {
      const dep = packageOf(imp.spec);
      // the layers, for the source (tests may reach further, to set up what they check)
      if (s.isSrc && layer && dep && dep !== s.part) {
        const page = s.path.startsWith('apps/cli/src/page/');
        const allowed =
          s.part === 'desktop'
            ? dep === 'audio' || (dep === 'ui' && imp.spec === '@chordinal/ui/native-bridge' && imp.typeOnly)
            : s.part === 'cli' && dep === 'playback'
              ? page
              : layer.includes(dep);
        if (!allowed) add('layers', s, imp.line, `${s.part} imports ${imp.spec}`);
        if ((s.part === 'composer' && dep === 'sketch') || (s.part === 'sketch' && dep === 'composer'))
          add('composer and sketch', s, imp.line, `${s.part} imports ${imp.spec}`);
      }
      // relative imports stay in their own package
      if (imp.spec.startsWith('.')) {
        const target = relative(ROOT, resolve(ROOT, dirname(s.path), imp.spec))
          .split(sep)
          .join('/');
        const home = s.part === 'test' ? 'test/' : s.path.split('/').slice(0, 2).join('/') + '/';
        if (!target.startsWith(home)) add('relative imports', s, imp.line, `${imp.spec} reaches ${target}`);
      }
      // the engine stays pure
      if (s.isSrc && isEngineLayer(s.part)) {
        const bare = imp.spec.split('/')[0] ?? '';
        if (
          imp.spec.startsWith('node:') ||
          NODE_MODULES.has(imp.spec) ||
          NODE_MODULES.has(bare) ||
          bare === 'preact' ||
          bare === '@preact'
        )
          add('pure engine', s, imp.line, `imports ${imp.spec}`);
      }
    }

    // names the file declares itself (an option called window is not the window)
    const declared = new Set<string>();
    visit(s.file, (node) => {
      if (
        (ts.isVariableDeclaration(node) ||
          ts.isParameter(node) ||
          ts.isBindingElement(node) ||
          ts.isFunctionDeclaration(node) ||
          ts.isImportSpecifier(node)) &&
        node.name &&
        ts.isIdentifier(node.name)
      )
        declared.add(node.name.text);
    });

    visit(s.file, (node) => {
      // the engine's globals
      if (s.isSrc && isEngineLayer(s.part)) {
        const name = ts.isIdentifier(node) && isFreeName(node) ? node.text : globalProperty(node);
        if (name && ENGINE_GLOBALS.has(name) && !declared.has(name))
          add('pure engine', s, lineOf(s, node), `uses ${name}`);
      }
      // the bridge's global
      if (
        !BRIDGE_FILES.includes(s.path) &&
        s.isSrc &&
        ((ts.isIdentifier(node) && node.text === 'chordinalNative') ||
          (ts.isStringLiteralLike(node) && node.text === 'chordinalNative'))
      )
        add('desktop bridge', s, lineOf(s, node), 'names chordinalNative');
      // projects only through the store
      if (isUi && !inStore) {
        if (ts.isIdentifier(node) && isFreeName(node) && node.text === 'indexedDB')
          add('projects through the store', s, lineOf(s, node), 'uses indexedDB');
        if (globalProperty(node) === 'indexedDB')
          add('projects through the store', s, lineOf(s, node), 'uses indexedDB');
        if (
          ts.isCallExpression(node) &&
          (globalProperty(node.expression) === 'fetch' ||
            (ts.isIdentifier(node.expression) && node.expression.text === 'fetch'))
        )
          add('projects through the store', s, lineOf(s, node), 'calls fetch');
        if (
          ts.isPropertyAccessExpression(node) &&
          node.name.text === 'projects' &&
          /\bnativeBridge\(\)|\bchordinalNative\b/.test(node.expression.getText(s.file))
        )
          add('projects through the store', s, lineOf(s, node), `uses ${node.getText(s.file)}`);
      }
      // key listeners
      if (
        s.isSrc &&
        !KEY_LISTENERS.includes(s.path) &&
        ts.isCallExpression(node) &&
        (ts.isIdentifier(node.expression)
          ? node.expression.text === 'addEventListener'
          : ts.isPropertyAccessExpression(node.expression) &&
            node.expression.name.text === 'addEventListener') &&
        node.arguments[0] &&
        ts.isStringLiteralLike(node.arguments[0]) &&
        ['keydown', 'keyup', 'keypress'].includes(node.arguments[0].text)
      )
        add('key listeners', s, lineOf(s, node), `listens for ${node.arguments[0].text}`);
      if (
        s.isSrc &&
        ts.isPropertyAccessExpression(node) &&
        ['onkeydown', 'onkeyup', 'onkeypress'].includes(node.name.text) &&
        ts.isBinaryExpression(node.parent) &&
        node.parent.left === node
      )
        add('key listeners', s, lineOf(s, node), `sets ${node.name.text}`);
      // command ids
      if (
        s.isSrc &&
        ts.isCallExpression(node) &&
        node.arguments[0] &&
        ts.isStringLiteralLike(node.arguments[0])
      ) {
        const e = node.expression;
        const names =
          (ts.isIdentifier(e) && e.text === 'item') ||
          (ts.isPropertyAccessExpression(e) &&
            ts.isIdentifier(e.expression) &&
            e.expression.text === 'catalog' &&
            ['get', 'run', 'menuItem'].includes(e.name.text));
        const id = node.arguments[0].text;
        if (names && !registered.has(id)) add('command ids', s, lineOf(s, node), `names command '${id}'`);
      }
      // type escapes
      if (node.kind === ts.SyntaxKind.AnyKeyword) add('type escapes', s, lineOf(s, node), 'any');
    });

    // the comments that switch the checker or the lint off
    const escape = /@ts-(ignore|expect-error|nocheck)\b|eslint-disable/g;
    const seen = new Set<number>();
    const comments = (pos: number) => {
      for (const ranges of [
        ts.getLeadingCommentRanges(s.text, pos),
        ts.getTrailingCommentRanges(s.text, pos),
      ])
        for (const r of ranges ?? []) {
          if (seen.has(r.pos)) continue;
          seen.add(r.pos);
          for (const m of s.text.slice(r.pos, r.end).matchAll(escape))
            add('type escapes', s, s.file.getLineAndCharacterOfPosition(r.pos).line + 1, m[0]);
        }
    };
    visit(s.file, (node) => {
      comments(node.getFullStart());
      comments(node.getEnd());
    });
  }
  return out;
}

// package.json: the dependencies a part lists
function packageBreaks(): Break[] {
  const out: Break[] = [];
  for (const group of ['packages', 'apps'])
    for (const part of readdirSync(join(ROOT, group))) {
      const file = join(ROOT, group, part, 'package.json');
      const layer = LAYERS[part];
      if (!existsSync(file) || !layer) continue;
      const pkg = JSON.parse(readFileSync(file, 'utf8')) as {
        dependencies?: Record<string, string>;
        devDependencies?: Record<string, string>;
      };
      for (const name of Object.keys({ ...pkg.dependencies, ...pkg.devDependencies })) {
        const dep = packageOf(name);
        if (dep && !layer.includes(dep))
          out.push({
            rule: 'package deps',
            path: `${group}/${part}/package.json`,
            line: 1,
            what: `depends on ${name}`,
          });
      }
    }
  return out;
}

type Counts = Record<string, Record<string, number>>;
type Exceptions = Record<string, { count: number; reason: string }>;

const readJson = <T>(name: string, empty: T): T => {
  const file = join(ROOT, 'test', name);
  return existsSync(file) ? (JSON.parse(readFileSync(file, 'utf8')) as T) : empty;
};

const breaks = [...findBreaks(), ...packageBreaks()];
const baseline = readJson<Counts>('architecture-baseline.json', {});
const exceptions = readJson<Exceptions>('architecture-exceptions.json', {});

function countsOf(rule: string): Map<string, Break[]> {
  const byFile = new Map<string, Break[]>();
  for (const b of breaks.filter((x) => x.rule === rule))
    byFile.set(b.path, [...(byFile.get(b.path) ?? []), b]);
  return byFile;
}

for (const rule of Object.keys(FIXES)) {
  test(`architecture: ${rule}`, () => {
    const allowed = (path: string) =>
      rule === 'type escapes' ? (exceptions[path]?.count ?? 0) : (baseline[rule]?.[path] ?? 0);
    const found = countsOf(rule);
    const problems: string[] = [];
    for (const [path, list] of found)
      if (list.length > allowed(path))
        problems.push(
          ...list.map((b) => `${b.path}:${b.line} ${b.what}`),
          ...(allowed(path) ? [`  (${path} is allowed ${allowed(path)}, has ${list.length})`] : []),
        );
    const listed = rule === 'type escapes' ? Object.keys(exceptions) : Object.keys(baseline[rule] ?? {});
    const stale = listed
      .filter((path) => (found.get(path)?.length ?? 0) < allowed(path))
      .map(
        (path) =>
          `${path} is allowed ${allowed(path)} but has ${found.get(path)?.length ?? 0}: lower its entry in test/architecture-${rule === 'type escapes' ? 'exceptions' : 'baseline'}.json`,
      );
    assert.ok(
      problems.length === 0 && stale.length === 0,
      `${[...problems, ...stale].join('\n')}\n\nHow to fix: ${FIXES[rule]}`,
    );
  });
}

test('architecture: the rules find what they look for', () => {
  // a sanity check that the scan reads the code: the catalog has commands, and the store's own files may use indexedDB
  assert.ok(sources.length > 100, `only ${sources.length} source files found`);
  assert.ok(
    sources.some((s) => s.path === 'packages/ui/src/store/idb-keyval.ts' && /indexedDB/.test(s.text)),
    'packages/ui/src/store/idb-keyval.ts uses indexedDB, so the store rule has something to leave alone',
  );
});
