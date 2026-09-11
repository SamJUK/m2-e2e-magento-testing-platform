#!/usr/bin/env node
/**
 * docs/COVERAGE.md claims a set of tests is implemented. This asserts that
 * claim against the specs on disk, in both directions: a test that ships
 * without a matrix row is undocumented, and a matrix row without a test is a
 * lie. Both are the same failure — a document that says more than it knows.
 *
 * theme-luma is the reference; the parity gate already holds theme-hyva to it.
 */
import { readdirSync, readFileSync } from 'node:fs';

const SPEC_DIR = 'packages/theme-luma/src/tests';
const MATRIX = 'docs/COVERAGE.md';

const titles = new Set();
let declared = 0;
for (const file of readdirSync(SPEC_DIR).filter((f) => f.endsWith('.spec.ts'))) {
  const src = readFileSync(`${SPEC_DIR}/${file}`, 'utf8');
  // Either quote style, and a title may contain the other one: a test called
  // "an order's detail page ..." has to be double-quoted, and the single-quote
  // pattern this gate started with skipped it silently.
  for (const [, , title] of src.matchAll(/\btest\(\s*\n?\s*(['"])(.*?)\1\s*,/g)) {
    titles.add(title);
  }
  declared += (src.match(/^\s*test\(/gm) ?? []).length;
}

// A title the pattern above cannot parse would vanish from both directions of
// this check, and the gate would report success over a test it never saw.
// Count what is declared and insist the two agree.
if (declared !== titles.size) {
  console.error(
    `::error::read ${titles.size} test titles but ${SPEC_DIR} declares ${declared} tests; ` +
      `one is written in a form this gate cannot parse`,
  );
  process.exit(1);
}

// Only ✅ rows make a claim. A ⬜ row naming a future test must not be counted.
//
// Gaps are counted as ROWS, not as unique titles: every ⬜ line in every table
// before `## Modules`, the legend excluded. ✅ rows are counted as unique
// titles, because a handful of tests are deliberately listed under two areas
// (the invoice and shipment emails belong to both Transactional email and
// Admin > Sales) and counting those rows twice would overstate the suite.
const claimed = new Set();
let gapRows = 0;
let headerLine = null;
for (const line of readFileSync(MATRIX, 'utf8').split('\n')) {
  if (line.startsWith('## Modules')) break; // module packages have their own suites
  if (line.startsWith('**Today:')) headerLine = line;
  if (!line.startsWith('|')) continue;
  if (/^\|\s*[✅⬜➖]\s*\|/.test(line)) continue; // the legend table
  if (line.includes('✅')) {
    const [, title] = line.match(/\|\s*`([^`]+)`/) ?? [];
    if (title) claimed.add(title);
    continue;
  }
  if (line.includes('⬜')) gapRows += 1;
}

const undocumented = [...titles].filter((t) => !claimed.has(t));
const unimplemented = [...claimed].filter((t) => !titles.has(t));

const errors = [];
for (const t of undocumented) errors.push(`test ships but has no row in ${MATRIX}: "${t}"`);
for (const t of unimplemented) errors.push(`${MATRIX} marks a test ✅ that does not exist: "${t}"`);

// The headline count is part of the claim. It drifted unnoticed for the whole
// of development precisely because nothing checked it: the file said
// "79 ✅ · 47 ⬜" while its own tables held 82 and 73. A gate that verifies the
// tables and ignores the number a reader actually reads covers less than it
// claims to.
const expected = `**Today: ${claimed.size} ✅ · ${gapRows} ⬜**`;
if (headerLine === null) {
  errors.push(`${MATRIX} has no "**Today: N ✅ · N ⬜**" line to check`);
} else if (headerLine !== expected) {
  errors.push(`${MATRIX} headline says ${headerLine} but its tables hold ${expected}`);
}

if (errors.length) {
  for (const e of errors) console.error(`::error::${e}`);
  process.exit(1);
}

console.log(
  `Coverage matrix matches ${titles.size} tests in ${SPEC_DIR}, ` +
    `and its headline matches its tables (${claimed.size} done, ${gapRows} gaps).`,
);
