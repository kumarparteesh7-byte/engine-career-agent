const http  = require('http');
const fs    = require('fs');
const path  = require('path');
const https = require('https');
const { load, updateJob } = require('../tracker/tracker');
const CV = require('../lib/cv');
const { scoreJob } = require('../scorer/score');
const { getDomain, DOMAINS, domainList } = require('../domains');

const PORT        = process.env.PORT || 3000;

const MODELS = [
  { id: 'claude-haiku-4-5-20251001', label: 'Claude Haiku',   provider: 'anthropic', note: 'fast' },
  { id: 'claude-sonnet-4-6',         label: 'Claude Sonnet',  provider: 'anthropic', note: 'smart' },
  { id: 'claude-opus-4-8',           label: 'Claude Opus',    provider: 'anthropic', note: 'best' },
  { id: 'llama-3.3-70b-versatile',   label: 'Llama 3.3 70B', provider: 'groq',      note: 'Groq' },
  { id: 'llama-3.1-8b-instant',      label: 'Llama 3.1 8B',  provider: 'groq',      note: 'Groq fast' },
  { id: 'moonshotai/kimi-k2-instruct', label: 'Kimi K2',     provider: 'groq',      note: 'Groq' },
];

function availableModels() {
  const hasAnthropic = !!process.env.ANTHROPIC_API_KEY;
  const hasGroq      = !!process.env.GROQ_API_KEY;
  return MODELS.filter(m =>
    (m.provider === 'anthropic' && hasAnthropic) ||
    (m.provider === 'groq'      && hasGroq)
  );
}
const HTML        = path.join(__dirname, 'index.html');
const LIB_CV      = path.join(__dirname, '../lib/cv.js');
const CONFIG_PATH = path.join(__dirname, '../../data/config.json');
const CV_PATH     = path.join(__dirname, '../../data/cv.txt');

// On a fresh deploy the personal CV isn't in the repo (gitignored). Seed it
// from the CV_TEXT env var so the hosted app can tailor against it.
if (process.env.CV_TEXT && !fs.existsSync(CV_PATH)) {
  fs.mkdirSync(path.dirname(CV_PATH), { recursive: true });
  fs.writeFileSync(CV_PATH, process.env.CV_TEXT);
}

function loadConfig() {
  if (fs.existsSync(CONFIG_PATH)) return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  return { keywords: [], locations: [], greenhouse: [], lever: [], ashby: [], filterThreshold: 3.5 };
}

// Optional HTTP Basic Auth — enabled whenever APP_PASSWORD is set (i.e. in
// production). Left open with no password for local development.
function authed(req, res) {
  const pass = process.env.APP_PASSWORD;
  if (!pass) return true;
  const [, b64] = (req.headers.authorization || '').split(' ');
  const [, pw] = Buffer.from(b64 || '', 'base64').toString().split(':');
  if (pw === pass) return true;
  res.writeHead(401, { 'WWW-Authenticate': 'Basic realm="Byte Engine"' });
  res.end('Authentication required');
  return false;
}

const server = http.createServer(async (req, res) => {
  // Health check must answer before auth so the host can probe it.
  if (req.url === '/healthz') { res.writeHead(200); return res.end('ok'); }
  if (!authed(req, res)) return;
  const url = new URL(req.url, `http://localhost:${PORT}`);

  // Jobs list
  if (url.pathname === '/api/jobs' && req.method === 'GET') {
    return json(res, load().sort((a,b) => (b.score?.total??0)-(a.score?.total??0)));
  }

  // Update job
  if (url.pathname.startsWith('/api/jobs/') && req.method === 'PATCH') {
    const id = decodeURIComponent(url.pathname.replace('/api/jobs/', ''));
    return readBody(req, b => json(res, updateJob(id, JSON.parse(b))));
  }

  // Get config
  if (url.pathname === '/api/config' && req.method === 'GET') {
    return json(res, loadConfig());
  }

  // Save config
  if (url.pathname === '/api/config' && req.method === 'PUT') {
    return readBody(req, b => {
      fs.writeFileSync(CONFIG_PATH, JSON.stringify(JSON.parse(b), null, 2));
      json(res, { ok: true });
    });
  }

  // Get CV
  if (url.pathname === '/api/cv' && req.method === 'GET') {
    const text = fs.existsSync(CV_PATH) ? fs.readFileSync(CV_PATH, 'utf8') : '';
    return json(res, { text });
  }

  // Save CV
  if (url.pathname === '/api/cv' && req.method === 'PUT') {
    return readBody(req, b => {
      const { text } = JSON.parse(b);
      fs.mkdirSync(path.dirname(CV_PATH), { recursive: true });
      fs.writeFileSync(CV_PATH, text);
      json(res, { ok: true });
    });
  }

  // Add manual job
  if (url.pathname === '/api/jobs' && req.method === 'POST') {
    return readBody(req, b => {
      const { title, company, location, url: jobUrl, description } = JSON.parse(b);
      const { makeJob } = require('../schema');
      const job = makeJob({
        title, company, location: location || 'Manual',
        url: jobUrl || '', description, source: 'manual',
        sourceId: `${company}-${Date.now()}`,
        remote: /remote/i.test(location + ' ' + description),
      });
      const { upsert } = require('../tracker/tracker');
      upsert([job]);
      json(res, job);
    });
  }

  // Available models (filtered by which API keys are present)
  if (url.pathname === '/api/models' && req.method === 'GET') {
    return json(res, availableModels());
  }

  // Domain list (for UI selector + dimension labels)
  if (url.pathname === '/api/domains' && req.method === 'GET') {
    return json(res, DOMAINS);
  }

  // In-product scoring — scores all 'new' jobs against the CV + chosen domain
  if (url.pathname === '/api/score' && req.method === 'POST') {
    return readBody(req, async b => {
      try {
        const { domainId = 'pm' } = b ? JSON.parse(b) : {};
        const domain = getDomain(domainId);
        const cvText = fs.existsSync(CV_PATH) ? fs.readFileSync(CV_PATH, 'utf8') : '';
        if (!cvText) { res.writeHead(400); return res.end('CV not loaded. Add your CV in Settings first.'); }
        const jobs = load().filter(j => j.status === 'new');
        if (!jobs.length) return json(res, { scored: 0, skipped: 0 });

        let scored = 0, errors = 0;
        const delay = ms => new Promise(r => setTimeout(r, ms));
        for (const job of jobs) {
          try {
            const score = await scoreJob(job, cvText, domainId);
            updateJob(job.id, { score, status: 'scored' });
            scored++;
          } catch (e) {
            const msg = e.message ?? '';
            if (msg.includes('429') || msg.includes('rate')) await delay(20000);
            else errors++;
          }
          await delay(400);
        }
        json(res, { scored, errors, total: jobs.length, domain: domain.label });
      } catch (e) { res.writeHead(500); res.end(e.message); }
    });
  }

  // Trigger scan
  if (url.pathname === '/api/scan' && req.method === 'POST') {
    const { execFile } = require('child_process');
    execFile(process.execPath, [path.join(__dirname, '../../src/scan.js')],
      { cwd: path.join(__dirname, '../..'), env: process.env },
      (err, stdout, stderr) => json(res, { ok: !err, output: stdout + stderr }));
    return;
  }

  // Chat / tailor
  if (url.pathname === '/api/chat' && req.method === 'POST') {
    return readBody(req, async b => {
      try {
        const { jobId, message, history, model } = JSON.parse(b);
        const job = load().find(j => j.id === jobId);
        if (!job) { res.writeHead(404); return res.end('Not found'); }
        const cvText = fs.existsSync(CV_PATH) ? fs.readFileSync(CV_PATH, 'utf8') : 'CV not loaded.';
        const reply = await chat(job, message, history ?? [], cvText, model);
        json(res, reply);
      } catch(e) { res.writeHead(500); res.end(e.message); }
    });
  }

  // PDF download — generates real PDF via puppeteer
  if (url.pathname.startsWith('/download-cv/') && req.method === 'GET') {
    const jobId = decodeURIComponent(url.pathname.replace('/download-cv/', ''));
    const job   = load().find(j => j.id === jobId);
    const cvRaw = fs.existsSync(CV_PATH) ? fs.readFileSync(CV_PATH, 'utf8') : '';
    const cvData = buildCVData(cvRaw, job?.tailoredBullets || null, job);
    try {
      const pdfBuf = await generatePDF(cvData);
      const filename = `Parteesh_Kumar_CV${job ? '_' + job.company.replace(/\s+/g,'_') : ''}.pdf`;
      res.writeHead(200, {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': pdfBuf.length,
      });
      return res.end(pdfBuf);
    } catch(e) {
      res.writeHead(500); return res.end('PDF generation failed: ' + e.message);
    }
  }

  // Word (.docx) download — built from the same cvData as the PDF
  if (url.pathname.startsWith('/download-docx/') && req.method === 'GET') {
    const jobId = decodeURIComponent(url.pathname.replace('/download-docx/', ''));
    const job   = load().find(j => j.id === jobId);
    const cvRaw = fs.existsSync(CV_PATH) ? fs.readFileSync(CV_PATH, 'utf8') : '';
    const cvData = buildCVData(cvRaw, job?.tailoredBullets || null, job);
    try {
      const docBuf = await generateDOCX(cvData);
      const filename = `Parteesh_Kumar_CV${job ? '_' + job.company.replace(/\s+/g,'_') : ''}.docx`;
      res.writeHead(200, {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': docBuf.length,
      });
      return res.end(docBuf);
    } catch(e) {
      res.writeHead(500); return res.end('DOCX generation failed: ' + e.message);
    }
  }

  // CV preview page
  if (url.pathname.startsWith('/cv/') && req.method === 'GET') {
    const jobId = decodeURIComponent(url.pathname.replace('/cv/', ''));
    const job   = load().find(j => j.id === jobId);
    const cvRaw = fs.existsSync(CV_PATH) ? fs.readFileSync(CV_PATH, 'utf8') : '';
    const tailored = job?.tailoredBullets || null;
    const cvData   = buildCVData(cvRaw, tailored, job);
    const tmpl     = fs.readFileSync(path.join(__dirname, 'cv-template.html'), 'utf8');
    const html     = tmpl.replace('window.__CV_DATA__;', `${JSON.stringify(cvData)};`);
    res.writeHead(200, { 'Content-Type': 'text/html' });
    return res.end(html);
  }

  // Shared CV module (same code the server uses)
  if (url.pathname === '/lib/cv.js' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/javascript' });
    return res.end(fs.readFileSync(LIB_CV));
  }

  // Dashboard HTML
  if (url.pathname === '/' || url.pathname === '/index.html') {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    return res.end(fs.readFileSync(HTML));
  }

  res.writeHead(404); res.end('Not found');
});

function readBody(req, cb) {
  let b = ''; req.on('data', c => b += c); req.on('end', () => cb(b));
}
function json(res, data) {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

// ── CHAT ─────────────────────────────────────────────────
// Tool that guarantees structured rewrites instead of hoping the model
// emits a JSON block inside prose.
function rewriteTool(companies) {
  return {
    name: 'apply_cv_rewrites',
    description: 'Apply rewritten CV bullet points to the candidate\'s CV so they appear in the live CV panel. Call this WHENEVER the user asks to rewrite, tailor, improve, punch up, or modify bullets for the target role. Return the full, final set of bullets for each role you are changing.',
    input_schema: {
      type: 'object',
      properties: {
        roles: {
          type: 'array',
          description: 'One entry per work-experience role being rewritten.',
          items: {
            type: 'object',
            properties: {
              company: { type: 'string', description: `The company name EXACTLY as it appears in the CV. Must be one of: ${companies.map(c => `"${c}"`).join(', ')}.` },
              bullets: { type: 'array', items: { type: 'string' }, description: 'The complete, ordered set of rewritten bullet points for this role (plain text, no markdown, no leading dash).' },
            },
            required: ['company', 'bullets'],
          },
        },
        summary: { type: 'string', description: 'A short, friendly message for the user explaining what you changed and why.' },
      },
      required: ['roles'],
    },
  };
}

function buildSystem(job, cvText, companies) {
  // If bullets have already been tailored in this session, show Claude the
  // current state so it can iterate on its own changes rather than the original.
  const tailored = job.tailoredBullets;
  let cvSection = cvText;
  if (tailored && Object.keys(tailored).length) {
    const lines = Object.entries(tailored)
      .map(([co, bs]) => `**${co}**\n${bs.map(b => `- ${b}`).join('\n')}`)
      .join('\n\n');
    cvSection += `\n\n---\n## Current tailored bullets (THESE are what the user sees now — iterate on these, not the originals above):\n${lines}`;
  }

  return `You are an elite CV coach helping the candidate land their target role. Your rewrites are sharp, impact-first, and mirror the language of the job description.

## Candidate CV
${cvSection}

## Target Job
Title: ${job.title} | Company: ${job.company} | Location: ${job.location}
${job.description}

## Bullet writing rules — follow these on every rewrite:
1. **STAR-lite format**: each bullet = Action verb → what you did (situation/task implicit) → measurable result. One sentence, no fluff.
   Good: "Redesigned onboarding flow for 3 enterprise accounts, cutting time-to-value from 90 to 45 days and lifting 6-month retention by 18%."
   Bad: "Responsible for helping customers onboard to the platform."

2. **Impact-first**: lead with the outcome when it's stronger than the action.
   Good: "Grew ARR from $2M to $8M in 18 months by building and leading a 6-person outbound sales motion."

3. **Mirror JD language**: lift keywords and phrases directly from the job description (e.g. if JD says "cross-functional stakeholder alignment", use that phrase).

4. **Preserve real numbers**: never invent metrics. Keep every dollar, percentage, headcount, and timeline from the original. If no metric exists, use scale/scope instead ("across 40+ enterprise accounts", "within a 120-person org").

5. **Tight**: max 20 words per bullet. Cut filler ("successfully", "leveraged", "utilised", "assisted with", "helped to").

6. **Strong verbs only**: Led, Built, Drove, Closed, Launched, Reduced, Grew, Negotiated, Shipped, Designed — not "Worked on", "Was involved in", "Supported".

## How to respond
- When the user wants bullets rewritten/tailored/improved, CALL the apply_cv_rewrites tool. Do NOT paste bullets as plain text — the tool updates the live CV panel.
- If tailored bullets exist above, iterate on THOSE, not the originals.
- Key each role by exact company name. Valid companies: ${companies.map(c => `"${c}"`).join(', ')}.
- For questions (gaps, advice, strategy), just answer in chat — only call the tool when actually changing bullets.`;
}

function parseBulletsFromContent(replyText, bullets) {
  if (!bullets) {
    const m = replyText.match(/```bullets\s*([\s\S]*?)```/);
    if (m) { try { bullets = JSON.parse(m[1]); replyText = replyText.replace(/```bullets[\s\S]*?```/g, '').trim(); } catch(_) {} }
  }
  return { replyText, bullets };
}

async function chat(job, message, history, cvText, modelId) {
  const companies = CV.companies(CV.parseCv(cvText));
  const systemPrompt = buildSystem(job, cvText, companies);
  const tool = rewriteTool(companies);

  // Resolve which model + provider to use
  const modelDef = MODELS.find(m => m.id === modelId) || MODELS[0];

  if (modelDef.provider === 'groq') {
    return chatGroq(job, message, history, systemPrompt, tool, companies, modelDef.id);
  }
  return chatAnthropic(job, message, history, systemPrompt, tool, companies, modelDef.id);
}

function chatAnthropic(job, message, history, systemPrompt, tool, companies, modelId) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set');

  const body = JSON.stringify({
    model: modelId,
    max_tokens: 2048,
    system: systemPrompt,
    tools: [tool],
    messages: [...history, { role: 'user', content: message }],
  });

  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'api.anthropic.com', path: '/v1/messages', method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey,
        'anthropic-version': '2023-06-01', 'Content-Length': Buffer.byteLength(body) },
    }, r => {
      let d = ''; r.on('data', c => d += c);
      r.on('end', () => {
        if (r.statusCode !== 200) return reject(new Error(`Anthropic ${r.statusCode}: ${d}`));
        const data = JSON.parse(d);
        let replyText = '', bullets = null;
        for (const block of data.content || []) {
          if (block.type === 'text') replyText += block.text;
          if (block.type === 'tool_use' && block.name === 'apply_cv_rewrites') {
            bullets = {};
            (block.input.roles || []).forEach(r => {
              if (r.company && Array.isArray(r.bullets)) bullets[r.company] = r.bullets;
            });
            if (block.input.summary) replyText += (replyText ? '\n\n' : '') + block.input.summary;
          }
        }
        ({ replyText, bullets } = parseBulletsFromContent(replyText, bullets));
        if (bullets && Object.keys(bullets).length) {
          updateJob(job.id, { tailoredBullets: bullets, status: 'tailored' });
          if (!replyText) replyText = 'Updated your CV bullets — see the panel on the right. ✏️';
        }
        resolve({ reply: replyText.trim(), bullets });
      });
    });
    req.on('error', reject); req.write(body); req.end();
  });
}

function chatGroq(job, message, history, systemPrompt, tool, companies, modelId) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error('GROQ_API_KEY not set');

  // Convert Anthropic tool schema → OpenAI function schema
  const openAITool = {
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.input_schema,
    },
  };

  const body = JSON.stringify({
    model: modelId,
    max_tokens: 2048,
    messages: [
      { role: 'system', content: systemPrompt },
      ...history,
      { role: 'user', content: message },
    ],
    tools: [openAITool],
    tool_choice: 'auto',
  });

  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'api.groq.com', path: '/openai/v1/chat/completions', method: 'POST',
      headers: { 'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'Content-Length': Buffer.byteLength(body) },
    }, r => {
      let d = ''; r.on('data', c => d += c);
      r.on('end', () => {
        if (r.statusCode !== 200) return reject(new Error(`Groq ${r.statusCode}: ${d}`));
        const data = JSON.parse(d);
        const msg = data.choices?.[0]?.message;
        let replyText = msg?.content || '', bullets = null;

        if (msg?.tool_calls?.length) {
          for (const tc of msg.tool_calls) {
            if (tc.function?.name === 'apply_cv_rewrites') {
              try {
                const input = JSON.parse(tc.function.arguments);
                bullets = {};
                (input.roles || []).forEach(r => {
                  if (r.company && Array.isArray(r.bullets)) bullets[r.company] = r.bullets;
                });
                if (input.summary) replyText += (replyText ? '\n\n' : '') + input.summary;
              } catch(_) {}
            }
          }
        }

        ({ replyText, bullets } = parseBulletsFromContent(replyText, bullets));
        if (bullets && Object.keys(bullets).length) {
          updateJob(job.id, { tailoredBullets: bullets, status: 'tailored' });
          if (!replyText) replyText = 'Updated your CV bullets — see the panel on the right. ✏️';
        }
        resolve({ reply: replyText.trim(), bullets });
      });
    });
    req.on('error', reject); req.write(body); req.end();
  });
}

// ── CV DATA BUILDER ──────────────────────────────────────
function buildCVData(cvRaw, tailoredBullets, job) {
  const { experience: sections, education } = CV.parseCv(cvRaw);

  // Apply tailored bullets if available — match by the shared fuzzy key
  // so the PDF/Word output matches what the chat panel showed.
  if (tailoredBullets) {
    const keys = Object.keys(tailoredBullets);
    sections.forEach(sec => {
      const key = CV.matchCompanyKey(keys, sec.company) || CV.matchCompanyKey(keys, sec.title);
      if (key) sec.bullets = tailoredBullets[key];
    });
  }

  return {
    name: 'Parteesh Kumar',
    headline: 'AI Automations Specialist',
    contact: [
      { label: 'Melbourne, Australia · Open to Sydney travel' },
      { label: 'parteesh25@gmail.com', url: 'mailto:parteesh25@gmail.com' },
      { label: '0481 825 099' },
      { label: 'LinkedIn', url: 'https://linkedin.com/in/parteesh-kumar' },
    ],
    metrics: [
      { value: '150+', label: 'Enterprise deals' },
      { value: '400/day', label: 'Finance ops automated' },
      { value: '$12M', label: 'AUD processed daily' },
      { value: '80%', label: 'Demo-to-POC rate' },
    ],
    sections,
    skills: [
      'Python · API Integration · Solution Architecture',
      'AI Agent Design · Agentic Workflow Automation',
      'OAuth · Auth Flows · Multi-tenant Integration',
      'Enterprise Pre-Sales · Demo Engineering',
      'ElevenLabs · Voice AI · Xero · Westpac · ERPs',
      'GCP · AWS Marketplace · Pattern Recognition',
    ],
    education: education.length ? education : [
      { degree: 'Master of Information Systems', school: 'University of Melbourne', year: '2023–2025' },
      { degree: 'Bachelor of Mechanical Engineering', school: 'Anna University, Chennai', year: '2017–2021' },
    ],
    tailoredFor: job ? { title: job.title, company: job.company } : null,
  };
}

// ── PDF GENERATION ───────────────────────────────────────
async function generatePDF(cvData) {
  const puppeteer = require('puppeteer');
  const tmpl = fs.readFileSync(path.join(__dirname, 'cv-template.html'), 'utf8');
  const html = tmpl.replace('window.__CV_DATA__;', `${JSON.stringify(cvData)};`);

  const browser = await puppeteer.launch({
    headless: 'new',
    // Use the container-provided Chrome in production; fall back to the
    // puppeteer-bundled one locally.
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
    args: [
      '--no-sandbox', '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',   // avoid /dev/shm OOM on small hosts
      '--disable-gpu', '--single-process', '--no-zygote',
    ],
  });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });
    // Wait for the template's auto-fit routine (runs after webfonts load).
    await page.waitForFunction(() => document.body.dataset.fitted === '1', { timeout: 8000 })
      .catch(() => {});
    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '0', right: '0', bottom: '0', left: '0' },
    });
    return pdf;
  } finally {
    await browser.close();
  }
}

// ── DOCX GENERATION ──────────────────────────────────────
// Builds a clean, ATS-friendly Word doc from the same cvData. Word docs
// reflow naturally, so no fixed-page fitting is needed.
async function generateDOCX(cvData) {
  const {
    Document, Packer, Paragraph, TextRun, HeadingLevel,
    AlignmentType, TabStopType, BorderStyle,
  } = require('docx');

  const INDIGO = '4F46E5';
  const GREY   = '6B7280';
  const DARK   = '111111';
  const RIGHT_TAB = 9000; // twips, ~ right margin for date alignment

  const para = (opts) => new Paragraph(opts);

  // Right-aligned date via a tab stop
  const roleHeading = (title, dates) => para({
    tabStops: [{ type: TabStopType.RIGHT, position: RIGHT_TAB }],
    spacing: { before: 160, after: 0 },
    children: [
      new TextRun({ text: title, bold: true, size: 23, color: DARK }),
      new TextRun({ text: `\t${dates || ''}`, size: 18, color: GREY }),
    ],
  });

  const sectionTitle = (text) => para({
    spacing: { before: 220, after: 80 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: 'E5E7EB', space: 2 } },
    children: [new TextRun({ text: text.toUpperCase(), bold: true, size: 17, color: INDIGO,
      characterSpacing: 40 })],
  });

  const children = [];

  // Name
  children.push(para({
    spacing: { after: 20 },
    children: [new TextRun({ text: cvData.name, bold: true, size: 52, color: '0F0F0F' })],
  }));
  // Headline + location
  children.push(para({
    spacing: { after: 20 },
    children: [
      new TextRun({ text: cvData.headline, bold: true, size: 22, color: INDIGO }),
      cvData.location ? new TextRun({ text: `   ·   ${cvData.location}`, size: 19, color: GREY }) : new TextRun(''),
    ],
  }));
  // Contact line
  children.push(para({
    spacing: { after: 60 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 12, color: INDIGO, space: 6 } },
    children: [new TextRun({
      text: (cvData.contact || []).map(c => c.label).join('   ·   '),
      size: 18, color: '4B5563',
    })],
  }));

  // Metrics line
  if (cvData.metrics && cvData.metrics.length) {
    children.push(para({
      spacing: { before: 120, after: 40 },
      alignment: AlignmentType.CENTER,
      children: cvData.metrics.flatMap((m, i) => [
        new TextRun({ text: `${m.value} `, bold: true, size: 22, color: INDIGO }),
        new TextRun({ text: m.label + (i < cvData.metrics.length - 1 ? '      ' : ''), size: 16, color: GREY }),
      ]),
    }));
  }

  // Tailored note
  if (cvData.tailoredFor) {
    children.push(para({
      spacing: { before: 80, after: 40 },
      shading: { fill: 'F5F3FF' },
      border: { left: { style: BorderStyle.SINGLE, size: 18, color: INDIGO, space: 8 } },
      children: [
        new TextRun({ text: 'Tailored for: ', size: 17, color: INDIGO }),
        new TextRun({ text: `${cvData.tailoredFor.title} at ${cvData.tailoredFor.company}`, bold: true, size: 17, color: INDIGO }),
      ],
    }));
  }

  // Experience
  children.push(sectionTitle('Experience'));
  (cvData.sections || []).forEach(s => {
    children.push(roleHeading(s.title, s.dates));
    children.push(para({
      spacing: { after: 40 },
      children: [new TextRun({ text: `${s.company}${s.location ? ' · ' + s.location : ''}`, italics: true, size: 18, color: GREY })],
    }));
    (s.bullets || []).forEach(b => children.push(para({
      spacing: { after: 30 },
      indent: { left: 220, hanging: 220 },
      children: [
        new TextRun({ text: '→  ', bold: true, color: INDIGO, size: 18 }),
        new TextRun({ text: b, size: 18, color: '2D2D2D' }),
      ],
    })));
  });

  // Education
  children.push(sectionTitle('Education'));
  (cvData.education || []).forEach(e => {
    children.push(para({
      tabStops: [{ type: TabStopType.RIGHT, position: RIGHT_TAB }],
      spacing: { before: 80, after: 0 },
      children: [
        new TextRun({ text: e.degree, bold: true, size: 20, color: DARK }),
        new TextRun({ text: `\t${e.year || ''}`, size: 17, color: GREY }),
      ],
    }));
    children.push(para({
      spacing: { after: 20 },
      children: [new TextRun({ text: e.school, italics: true, size: 17, color: GREY })],
    }));
  });

  // Skills
  children.push(sectionTitle('Core Skills'));
  (cvData.skills || []).forEach(row => children.push(para({
    spacing: { after: 30 },
    children: [new TextRun({ text: '· ' + row, size: 18, color: '374151' })],
  })));

  const doc = new Document({
    sections: [{
      properties: { page: { margin: { top: 720, bottom: 720, left: 900, right: 900 } } },
      children,
    }],
    styles: { default: { document: { run: { font: 'Calibri' } } } },
  });

  return Packer.toBuffer(doc);
}

server.listen(PORT, () => console.log(`Dashboard → http://localhost:${PORT}`));
