#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { getDb, closeDb } from '../server/src/db.js';
import { getMetricSnapshot } from '../server/src/metrics.js';
import { snapshotToReferenceRows } from '../server/src/metricSnapshot.js';

const DEFAULT_REFERENCE_DIR = '/home/vmuser/Downloads/repo-references';
const DEFAULT_FILES = [
  'cJSON_6d9f2443ab07.csv',
  'redis_b540ca49cba8.csv',
  'git_5a7d1e8045ce.csv',
];
const METRIC_FIELDS = [
  'added',
  'removed',
  'growth',
  'churn',
  'modifications',
  'modification_frequency',
  'churn_rate',
  'ownership',
];

function parseCsv(content) {
  const records = [];
  let record = [];
  let field = '';
  let quoted = false;

  for (let i = 0; i < content.length; i++) {
    const char = content[i];
    if (quoted) {
      if (char === '"' && content[i + 1] === '"') {
        field += '"';
        i += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        field += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ',') {
      record.push(field);
      field = '';
    } else if (char === '\n') {
      record.push(field.replace(/\r$/, ''));
      records.push(record);
      record = [];
      field = '';
    } else {
      field += char;
    }
  }
  if (field.length > 0 || record.length > 0) {
    record.push(field.replace(/\r$/, ''));
    records.push(record);
  }

  const [headers, ...rows] = records;
  return rows
    .filter(row => row.some(value => value !== ''))
    .map(row => Object.fromEntries(headers.map((header, index) => [header, row[index] ?? ''])));
}

function rowKey(row) {
  return `${row.object_type}\u0000${row.path}\u0000${row.author}`;
}

function numbersEqual(expected, actual) {
  if (expected === '' || expected === null || expected === undefined) {
    return actual === '' || actual === null || actual === undefined;
  }
  const expectedNumber = Number(expected);
  const actualNumber = Number(actual);
  if (!Number.isFinite(expectedNumber) || !Number.isFinite(actualNumber)) return String(expected) === String(actual);
  const scale = Math.max(1, Math.abs(expectedNumber), Math.abs(actualNumber));
  return Math.abs(expectedNumber - actualNumber) <= 1e-12 * scale;
}

function compareRows(expectedRows, actualRows) {
  const expectedMap = new Map(expectedRows.map(row => [rowKey(row), row]));
  const actualMap = new Map(actualRows.map(row => [rowKey(row), row]));
  const missing = [];
  const unexpected = [];
  const mismatches = [];

  for (const [key, expected] of expectedMap) {
    const actual = actualMap.get(key);
    if (!actual) {
      missing.push(expected);
      continue;
    }
    for (const field of METRIC_FIELDS) {
      if (!numbersEqual(expected[field], actual[field])) {
        mismatches.push({ key, field, expected: expected[field], actual: actual[field] });
      }
    }
  }

  for (const [key, actual] of actualMap) {
    if (!expectedMap.has(key)) unexpected.push(actual);
  }

  return { missing, unexpected, mismatches };
}

function printExamples(label, values, format) {
  if (values.length === 0) return;
  console.log(`  ${label} (${values.length}):`);
  for (const value of values.slice(0, 20)) console.log(`    ${format(value)}`);
  if (values.length > 20) console.log(`    ... ${values.length - 20} more`);
}

function compareFile(csvPath) {
  const expectedRows = parseCsv(fs.readFileSync(csvPath, 'utf8'));
  if (expectedRows.length === 0) throw new Error(`No metric rows in ${csvPath}`);

  const { repo: repoName, ref_sha: refSha, commit_count: commitCount } = expectedRows[0];
  const db = getDb();
  const repo = db.prepare(`
    SELECT id, name, ref_commit, commit_count
    FROM repositories
    WHERE ref_commit = ? OR lower(name) = lower(?)
    ORDER BY CASE WHEN ref_commit = ? THEN 0 ELSE 1 END, id DESC
    LIMIT 1
  `).get(refSha, repoName, refSha);

  console.log(`\n${path.basename(csvPath)}:`);
  if (!repo) {
    console.log(`  SKIP: no ingested repository for ${repoName} at ${refSha}`);
    return { skipped: true, failed: false };
  }
  if (repo.ref_commit !== refSha) {
    console.log(`  FAIL: repository ${repo.id} is at ${repo.ref_commit}, expected ${refSha}`);
    return { skipped: false, failed: true };
  }
  if (Number(repo.commit_count) !== Number(commitCount)) {
    console.log(`  FAIL: repository has ${repo.commit_count} commits, expected ${commitCount}`);
    return { skipped: false, failed: true };
  }

  const snapshot = getMetricSnapshot(repo.id);
  const actualRows = snapshotToReferenceRows(snapshot);
  const result = compareRows(expectedRows, actualRows);
  const failed = result.missing.length > 0 || result.unexpected.length > 0 || result.mismatches.length > 0;

  console.log(`  repo id: ${repo.id}`);
  console.log(`  rows: expected=${expectedRows.length}, actual=${actualRows.length}`);
  console.log(`  result: ${failed ? 'FAIL' : 'PASS'}`);
  printExamples('missing rows', result.missing, row => rowKey(row).replaceAll('\u0000', ' | '));
  printExamples('unexpected rows', result.unexpected, row => rowKey(row).replaceAll('\u0000', ' | '));
  printExamples('metric mismatches', result.mismatches, mismatch =>
    `${mismatch.key.replaceAll('\u0000', ' | ')} | ${mismatch.field}: expected=${mismatch.expected}, actual=${mismatch.actual}`
  );
  return { skipped: false, failed };
}

const suppliedPaths = process.argv.slice(2);
const csvPaths = suppliedPaths.length > 0
  ? suppliedPaths.map(file => path.resolve(process.cwd(), file))
  : DEFAULT_FILES.map(file => path.join(DEFAULT_REFERENCE_DIR, file));

let failed = false;
let compared = 0;
try {
  for (const csvPath of csvPaths) {
    if (!fs.existsSync(csvPath)) {
      console.log(`\n${csvPath}:\n  SKIP: file not found`);
      continue;
    }
    const result = compareFile(csvPath);
    if (!result.skipped) compared += 1;
    failed ||= result.failed;
  }
} finally {
  closeDb();
}

if (compared === 0) {
  console.error('\nNo reference files had a matching ingested repository.');
  process.exitCode = 2;
} else if (failed) {
  process.exitCode = 1;
} else {
  console.log(`\nAll ${compared} ingested reference repositories match.`);
}
