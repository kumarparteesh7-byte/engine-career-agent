/**
 * PM scoring rubric — used in the LLM prompt.
 *
 * Five dimensions, each 0–5. Weights sum to 1.0.
 * Total = weighted average of dimension scores.
 *
 * Dimension weights reflect what separates strong PM fits from noise.
 */

const DIMENSIONS = [
  {
    key: 'productSense',
    label: 'Product Sense',
    weight: 0.25,
    signals: [
      'customer/user empathy language in JD',
      'asks for vision or strategy ownership',
      'roadmap prioritisation accountability',
      'design partnership or discovery responsibility',
      '"why" framing over "what/how"',
    ],
    antiSignals: [
      'purely execution/delivery focus',
      'spec-writing only, no strategy ownership',
    ],
  },
  {
    key: 'execution',
    label: 'Execution',
    weight: 0.20,
    signals: [
      'cross-functional delivery ownership',
      'launch accountability',
      'sprint/agile leadership',
      'dependency management',
      'unblocking engineering teams',
    ],
    antiSignals: [
      'project coordinator role only',
      'no ownership language',
    ],
  },
  {
    key: 'influence',
    label: 'Influence Without Authority',
    weight: 0.20,
    signals: [
      'stakeholder alignment across functions',
      'executive communication',
      'driving consensus in ambiguity',
      'partner/sales/marketing collaboration',
    ],
    antiSignals: [
      'manages direct reports only, no lateral influence',
    ],
  },
  {
    key: 'discovery',
    label: 'Discovery & Insight',
    weight: 0.15,
    signals: [
      'user research or qualitative methods',
      'market or competitive analysis',
      'hypothesis-driven development',
      'experimentation / A-B ownership',
    ],
    antiSignals: [
      'requirements handed down from leadership only',
    ],
  },
  {
    key: 'metricsImpact',
    label: 'Metrics & Impact',
    weight: 0.20,
    signals: [
      'outcome-ownership language (revenue, retention, NPS, DAU …)',
      'data-driven decision-making',
      'OKR/KPI accountability',
      'quantified impact in role description',
    ],
    antiSignals: [
      'output-only metrics (stories delivered, bugs closed)',
    ],
  },
];

const FILTER_THRESHOLD = 4.0; // don't tailor below this

/**
 * Build the scoring section of the LLM system prompt.
 */
function buildRubricPrompt() {
  const dims = DIMENSIONS.map((d) =>
    `### ${d.label} (weight ${d.weight}, key: ${d.key})
Positive signals: ${d.signals.join('; ')}
Anti-signals (reduce score): ${d.antiSignals.join('; ')}`
  ).join('\n\n');

  return `You are a PM career coach scoring a job description against a candidate's CV.

Score each of the five PM dimensions from 0 to 5 (decimals fine):

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
  "productSense": <number>,
  "execution": <number>,
  "influence": <number>,
  "discovery": <number>,
  "metricsImpact": <number>,
  "matchedCompetencies": [<string>, ...],
  "gaps": [<string>, ...],
  "reasoning": "<2-3 sentence summary>"
}`;
}

module.exports = { DIMENSIONS, FILTER_THRESHOLD, buildRubricPrompt };
