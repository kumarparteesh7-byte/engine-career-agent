const http = require('http');
const fs = require('fs');
const path = require('path');
const { load, updateJob } = require('../tracker/tracker');

const PORT = 3000;
const HTML = path.join(__dirname, 'index.html');

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);

  // API: list jobs
  if (url.pathname === '/api/jobs' && req.method === 'GET') {
    const jobs = load();
    const minScore = parseFloat(url.searchParams.get('minScore') ?? '0');
    const filtered = minScore > 0
      ? jobs.filter(j => j.score && j.score.total >= minScore)
      : jobs;
    const sorted = filtered.sort((a, b) => (b.score?.total ?? 0) - (a.score?.total ?? 0));
    return json(res, sorted);
  }

  // API: update job status
  if (url.pathname.startsWith('/api/jobs/') && req.method === 'PATCH') {
    const id = decodeURIComponent(url.pathname.replace('/api/jobs/', ''));
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => {
      try {
        const patch = JSON.parse(body);
        const updated = updateJob(id, patch);
        json(res, updated);
      } catch (e) {
        res.writeHead(400); res.end(e.message);
      }
    });
    return;
  }

  // API: trigger scan
  if (url.pathname === '/api/scan' && req.method === 'POST') {
    const { execFile } = require('child_process');
    const node = process.execPath;
    const script = path.join(__dirname, '../../src/scan.js');
    execFile(node, [script], { cwd: path.join(__dirname, '../..') }, (err, stdout, stderr) => {
      json(res, { ok: !err, output: stdout + stderr });
    });
    return;
  }

  // Serve dashboard HTML
  if (url.pathname === '/' || url.pathname === '/index.html') {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    return res.end(fs.readFileSync(HTML));
  }

  res.writeHead(404); res.end('Not found');
});

function json(res, data) {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

server.listen(PORT, () => {
  console.log(`Dashboard running at http://localhost:${PORT}`);
});
