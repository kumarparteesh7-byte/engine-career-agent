#!/usr/bin/env node
/**
 * score-all.js — score all 'new' jobs in the tracker against your CV.
 *
 * Usage:
 *   ANTHROPIC_API_KEY=sk-... node src/score-all.js [--domain csm]
 *
 * Reads CV from: data/cv.txt  (plain text — paste your CV there)
 * Domain defaults to 'pm'. Use --domain se|csm|sales|account to switch.
 */

const fs = require('fs');
const path = require('path');
const { scoreJob } = require('./scorer/score');
const { load, updateJob } = require('./tracker/tracker');
const { getDomain, DEFAULT_DOMAIN } = require('./domains');

const CV_PATH = path.join(__dirname, '../data/cv.txt');

function parseDomainArg() {
  const idx = process.argv.indexOf('--domain');
  return idx !== -1 ? process.argv[idx + 1] : DEFAULT_DOMAIN;
}

async function run() {
  if (!fs.existsSync(CV_PATH)) {
    console.error(`CV not found at ${CV_PATH}. Paste your CV text there first.`);
    process.exit(1);
  }

  const domainId = parseDomainArg();
  const domain = getDomain(domainId);
  const cvText = fs.readFileSync(CV_PATH, 'utf8');
  const jobs = load().filter((j) => j.status === 'new');

  console.log(`Domain: ${domain.label} (${domain.id})`);
  console.log(`Scoring ${jobs.length} new jobs…\n`);

  const delay = (ms) => new Promise((r) => setTimeout(r, ms));

  for (const job of jobs) {
    process.stdout.write(`  ${job.company} — ${job.title}… `);
    try {
      const score = await scoreJob(job, cvText, domainId);
      updateJob(job.id, { score, status: 'scored' });
      const flag = score.total >= domain.filterThreshold ? '✓' : '–';
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
    await delay(500);
  }

  console.log(`\nFilter threshold: ${domain.filterThreshold}. Roles ≥ ${domain.filterThreshold} are ready to tailor.`);
}

run().catch((e) => { console.error(e); process.exit(1); });
