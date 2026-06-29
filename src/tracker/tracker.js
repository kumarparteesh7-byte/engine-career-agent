const fs = require('fs');
const path = require('path');

const TRACKER_PATH = path.join(__dirname, '../../data/tracker.json');

function load() {
  if (!fs.existsSync(TRACKER_PATH)) return [];
  return JSON.parse(fs.readFileSync(TRACKER_PATH, 'utf8'));
}

function save(jobs) {
  fs.mkdirSync(path.dirname(TRACKER_PATH), { recursive: true });
  fs.writeFileSync(TRACKER_PATH, JSON.stringify(jobs, null, 2));
}

/**
 * Upsert jobs into the tracker. Existing jobs (matched by id) are updated;
 * new ones are appended. Preserves manual status changes.
 */
function upsert(newJobs) {
  const existing = load();
  const byId = new Map(existing.map((j) => [j.id, j]));

  for (const job of newJobs) {
    const prev = byId.get(job.id);
    if (prev) {
      // Preserve human-set status and tailored CV path
      byId.set(job.id, { ...job, status: prev.status, tailoredCv: prev.tailoredCv, score: prev.score ?? job.score });
    } else {
      byId.set(job.id, job);
    }
  }

  const updated = Array.from(byId.values());
  save(updated);
  return updated;
}

function updateJob(id, patch) {
  const jobs = load();
  const idx = jobs.findIndex((j) => j.id === id);
  if (idx === -1) throw new Error(`Job not found: ${id}`);
  jobs[idx] = { ...jobs[idx], ...patch };
  save(jobs);
  return jobs[idx];
}

module.exports = { load, save, upsert, updateJob, TRACKER_PATH };
