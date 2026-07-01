const https = require('https');
const { buildRubricPrompt } = require('./rubric');
const { getDomain, DEFAULT_DOMAIN } = require('../domains');

/**
 * Score a single job against a CV string using Claude Haiku.
 * @param {object} job
 * @param {string} cvText
 * @param {string} [domainId] - domain id from src/domains.js (defaults to 'pm')
 */
async function scoreJob(job, cvText, domainId = DEFAULT_DOMAIN) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set in environment');

  const domain = getDomain(domainId);

  const body = JSON.stringify({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1024,
    system: buildRubricPrompt(domain),
    messages: [
      {
        role: 'user',
        content: `## Candidate CV\n\n${cvText}\n\n## Job Description\n\nTitle: ${job.title}\nCompany: ${job.company}\nLocation: ${job.location}\n\n${job.description}`,
      },
    ],
  });

  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.anthropic.com',
      path: '/v1/messages',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Length': Buffer.byteLength(body),
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        if (res.statusCode !== 200) {
          reject(new Error(`Anthropic API ${res.statusCode}: ${data}`));
          return;
        }
        try {
          const parsed = JSON.parse(data);
          const text = parsed.content?.[0]?.text ?? '';
          const clean = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
          const score = JSON.parse(clean);
          // Normalise: ensure dimensions map exists (handles old flat-key responses)
          if (!score.dimensions) {
            const { total, matchedCompetencies, gaps, reasoning, ...rest } = score;
            score.dimensions = rest;
          }
          score.domainId = domain.id;
          resolve(score);
        } catch (e) {
          reject(new Error(`Failed to parse score JSON: ${e.message}\nRaw: ${data}`));
        }
      });
    });

    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

module.exports = { scoreJob };
