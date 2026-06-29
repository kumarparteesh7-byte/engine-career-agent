#!/usr/bin/env node
/**
 * scan.js — fetch jobs from configured sources and upsert into the tracker.
 *
 * Usage:
 *   node src/scan.js
 *   node src/scan.js --source greenhouse --company stripe
 */

const { fetchGreenhouse } = require('./adapters/greenhouse');
const { upsert } = require('./tracker/tracker');

// PM-relevant keywords to filter titles (edit to taste)
const PM_KEYWORDS = [
  'product manager',
  'product management',
  'senior pm',
  'staff pm',
  'group pm',
  'principal pm',
  'director of product',
  'head of product',
  'vp product',
  'product lead',
  'product owner',
];

// Companies to scan on Greenhouse (add your own)
const GREENHOUSE_BOARDS = [
  'notion',
  'figma',
  'linear',
  'vercel',
  'stripe',
  'anthropic',
  'airtable',
  'retool',
  'loom',
];

async function run() {
  console.log('Scanning Greenhouse boards…');
  const allJobs = [];

  for (const board of GREENHOUSE_BOARDS) {
    process.stdout.write(`  ${board}… `);
    try {
      const jobs = await fetchGreenhouse(board, PM_KEYWORDS);
      console.log(`${jobs.length} PM roles`);
      allJobs.push(...jobs);
    } catch (e) {
      console.log(`error: ${e.message}`);
    }
  }

  const stored = upsert(allJobs);
  const newCount = allJobs.length;
  console.log(`\nDone. ${newCount} jobs fetched, ${stored.length} total in tracker.`);
}

run().catch((e) => { console.error(e); process.exit(1); });
