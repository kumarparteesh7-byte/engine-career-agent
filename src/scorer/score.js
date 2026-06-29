const https = require('https');
const { buildRubricPrompt } = require('./pm-rubric');

/**
 * Score a single job against a CV string using Claude.
 * Requires ANTHROPIC_API_KEY in environment.
 *
 * @param {import('../schema').Job} job
 * @param {string} cvText  - Plain-text CV content
 * @returns {Promise<import('../schema').Score>}
 */
async function scoreJob(job, cvText) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set in environment');

  const systemPrompt = buildRubricPrompt();

  const userMessage = `## Candidate CV\n\n${cvText}\n\n## Job Description\n\nTitle: ${job.title}\nCompany: ${job.company}\nLocation: ${job.location}\n\n${job.description}`;

  const body = JSON.stringify({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1024,
    system: systemPrompt,
    messages: [{ role: 'user', content: userMessage }],
  });

  const score = await callAnthropic(body, apiKey);
  return score;
}

function callAnthropic(body, apiKey) {
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
          const score = JSON.parse(text);
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
