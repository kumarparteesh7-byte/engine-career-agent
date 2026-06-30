#!/usr/bin/env node
/**
 * score-all.js — score all 'new' jobs in the tracker against your CV.
 *
 * Usage:
 *   ANTHROPIC_API_KEY=sk-... node src/score-all.js
 *
 * Reads CV from: data/cv.txt  (plain text — paste your CV there)
 */

const fs = require('fs');
const path = require('path');
const { scoreJob } = require('./scorer/score');
const { load, updateJob } = require('./tracker/tracker');
const { FILTER_THRESHOLD } = require('./scorer/pm-rubric');

const CV_PATH = path.join(__dirname, '../data/cv.txt');

async function run() {
  if (!fs.existsSync(CV_PATH)) {
    console.error(`CV not found at ${CV_PATH}. Paste your CV text there first.`);
    process.exit(1);
  }
  const cvText = fs.readFileSync(CV_PATH, 'utf8');
  const jobs = load().filter((j) => j.status === 'new');
  console.log(`Scoring ${jobs.length} new jobs…`);

  const delay = (ms) => new Promise((r) => setTimeout(r, ms));

  for (const job of jobs) {
    process.stdout.write(`  ${job.company} — ${job.title}… `);
    try {
      const score = await scoreJob(job, cvText);
      updateJob(job.id, { score, status: 'scored' });
      const flag = score.total >= FILTER_THRESHOLD ? '✓' : '–';
      console.log(`${score.total.toFixed(1)} ${flag}`);
    } catch (e) {
      const msg = e.message ?? '';
      if (msg.includes('429') || msg.includes('rate')) {
        console.log('rate limited — waiting 20s…');
        await delay(20000);
      } else {
        console.log(`error: ${msg.slice(0, 80)}`);
      }
    }
    await delay(500); // stay within Groq free tier (30 req/min)
  }
  console.log(`\nFilter threshold: ${FILTER_THRESHOLD}. Roles ≥ ${FILTER_THRESHOLD} are ready to tailor.`);
}

run().catch((e) => { console.error(e); process.exit(1); });
