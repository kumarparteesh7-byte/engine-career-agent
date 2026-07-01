const { getDomain } = require('../domains');

/**
 * Build the LLM system prompt for scoring a job against a given domain.
 * @param {object} domain - A domain object from src/domains.js
 */
function buildRubricPrompt(domain) {
  const dims = domain.dimensions.map((d) =>
    `### ${d.label} (weight ${d.weight}, key: ${d.key})
Positive signals: ${d.signals.join('; ')}
Anti-signals (reduce score): ${d.antiSignals.join('; ')}`
  ).join('\n\n');

  const dimKeys = domain.dimensions.map((d) => `"${d.key}": <number>`).join(',\n  ');

  return `You are a ${domain.label} career coach scoring a job description against a candidate's CV.

Score each dimension from 0 to 5 (decimals allowed):

${dims}

Scoring scale:
0 = dimension completely absent or role is wrong function
1 = weak or passing mention only
2 = present but shallow
3 = clearly expected, moderate depth
4 = strong signal, multiple evidence points
5 = exceptional match, core to the role

Compute total = weighted average using the weights above.

Return ONLY valid JSON, no markdown, in this exact shape:
{
  "total": <number>,
  "dimensions": {
    ${dimKeys}
  },
  "matchedCompetencies": [<string>, ...],
  "gaps": [<string>, ...],
  "reasoning": "<2-3 sentence summary>"
}`;
}

module.exports = { buildRubricPrompt };
