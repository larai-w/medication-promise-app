#!/usr/bin/env node

import { execFileSync } from 'node:child_process';

const dryRun = process.argv.includes('--dry-run');
const projectArgIndex = process.argv.indexOf('--project');
const projectNumber = projectArgIndex >= 0 ? process.argv[projectArgIndex + 1] : null;
const repository = 'larai-w/medication-promise-app';
const owner = repository.split('/')[0];

const gh = (args) =>
  execFileSync('gh', args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();

const run = (description, args) => {
  if (dryRun) {
    console.log(`[dry-run] ${description}`);
    return '';
  }
  return gh(args);
};

const labels = [
  ['story', '1d76db', 'User-facing outcome with acceptance criteria'],
  ['task', '6f42c1', 'Technical or operational enabling work'],
  ['evidence:backfill', 'bfd4f2', 'Reconstructed from dated documents and commits; not originally managed as a GitHub issue'],
  ['process:ai-assisted', '8250df', 'AI-assisted under a written scope and maintainer review'],
  ['area:web', '0e8a16', 'Web application and API'],
  ['area:alexa', 'fbca04', 'Alexa skill, interaction model, and Lambda'],
  ['area:data', '0052cc', 'DynamoDB schema, access, and migration'],
  ['area:delivery', '5319e7', 'CI/CD, infrastructure, and release operations'],
  ['area:docs', '0075ca', 'Documentation and portfolio evidence'],
  ['area:safety', 'b60205', 'Safety, privacy, access, or healthcare wording'],
  ['P0', 'b60205', 'Release blocker or safety/production continuity risk'],
  ['P1', 'd93f0b', 'High-priority outcome'],
  ['P2', 'fbca04', 'Normal-priority improvement'],
  ['P3', 'c5def5', 'Later opportunity'],
];

const milestones = [
  {
    title: 'Household MVP — Evidence Backfill',
    description:
      'Completed household workflow, reliability, hosting, and safety work reconstructed from contemporaneous documents and commits.',
  },
  {
    title: 'Limited Beta — Identity and Validation',
    description:
      'Per-household identity, Alexa linking, isolation verification, and a small invitation-only outcome validation.',
  },
  {
    title: 'Public Readiness — Safety and Operations',
    description:
      'Privacy, deletion, recovery, observability, support, and release evidence required before broader availability.',
  },
];

const evidenceNote = `> **Historical evidence backfill (2026-07-19):** This issue was reconstructed from contemporaneous repository documents, tests, production notes, and commits. It was not managed as a GitHub issue at the time. The label \`evidence:backfill\` preserves that distinction.`;

const completedStories = [
  {
    title: '[Story] Caregiver can review today’s five medication timings',
    story:
      'As a family caregiver, I want to see today’s five medication timings on one screen, so that I can understand the recorded state without reconstructing it from memory.',
    criteria: [
      'The current date and five household timing categories are visible.',
      'Recorded and unrecorded timings are visually distinguishable.',
      'The view reads records from the shared household data store.',
    ],
    evidence: 'Initial implementation: https://github.com/larai-w/medication-promise-app/commit/1ecf639',
    labels: ['story', 'evidence:backfill', 'area:web', 'P1'],
  },
  {
    title: '[Story] Caregiver can record medication with one tap',
    story:
      'As a busy family caregiver, I want to record a medication timing with one tap, so that logging does not add another form-filling task to care work.',
    criteria: [
      'A timing button creates a record using a sensible default time.',
      'The screen refreshes to show the recorded state.',
      'API failures are visible rather than silently ignored.',
    ],
    evidence:
      'Initial flow: https://github.com/larai-w/medication-promise-app/commit/1ecf639 · UX/error improvements: https://github.com/larai-w/medication-promise-app/commit/9309bd8',
    labels: ['story', 'evidence:backfill', 'area:web', 'P1'],
  },
  {
    title: '[Story] Caregiver can correct or remove a mistaken record',
    story:
      'As a family caregiver, I want to edit or delete an accidental record, so that the history remains a useful account of what was logged.',
    criteria: [
      'Date, timing, time, and notes can be edited.',
      'Deletion requires explicit confirmation.',
      'The updated record list is shown after the operation.',
    ],
    evidence:
      'Initial edit/delete flow: https://github.com/larai-w/medication-promise-app/commit/1ecf639 · safer UX: https://github.com/larai-w/medication-promise-app/commit/9309bd8',
    labels: ['story', 'evidence:backfill', 'area:web', 'P1'],
  },
  {
    title: '[Story] Caregiver can review and export a monthly record',
    story:
      'As a family caregiver, I want a monthly view and printable PDF, so that I can review the household record without relying on recall.',
    criteria: [
      'A month can be reviewed by date and timing.',
      'Previous and next months can be selected.',
      'A Japanese-language PDF can be downloaded for the selected month.',
    ],
    evidence:
      'Monthly view and PDF: https://github.com/larai-w/medication-promise-app/commit/1ecf639 · reporting improvements: https://github.com/larai-w/medication-promise-app/commit/9309bd8',
    labels: ['story', 'evidence:backfill', 'area:web', 'P1'],
  },
  {
    title: '[Story] Person taking medication can record by voice',
    story:
      'As a person who finds phone interaction difficult, I want to record a medication timing through Alexa, so that I can log it from where I am.',
    criteria: [
      'Japanese utterances cover all five timing categories.',
      'The skill confirms a successful record without giving medical advice.',
      'Alexa and Web write to the same household record store.',
    ],
    evidence:
      'Alexa implementation: https://github.com/larai-w/medication-promise-app/commit/1ecf639 · safer wording and tests: https://github.com/larai-w/medication-promise-app/commit/83944bc',
    labels: ['story', 'evidence:backfill', 'area:alexa', 'P1'],
  },
  {
    title: '[Story] Household can create five daily Alexa reminders',
    story:
      'As a household member, I want Alexa to create the five daily reminders together, so that the recurring schedule does not need to be entered one reminder at a time.',
    criteria: [
      'The reminder intent requests the required Alexa permission when absent.',
      'Existing reminders created by the skill are replaced to avoid duplicates.',
      'Five daily reminders are created for the household schedule.',
    ],
    evidence:
      'Reminder implementation: https://github.com/larai-w/medication-promise-app/commit/1b28331 · exception handling and safe defaults: https://github.com/larai-w/medication-promise-app/commit/83944bc',
    labels: ['story', 'evidence:backfill', 'area:alexa', 'area:safety', 'P1'],
  },
  {
    title: '[Story] Maintainer receives automated change verification',
    story:
      'As the maintainer, I want Web and Alexa checks to run on changes, so that basic regressions are found before release.',
    criteria: [
      'Web tests, lint, and production build run in GitHub Actions.',
      'Alexa syntax, tests, and Lambda packaging run in GitHub Actions.',
      'The Lambda package is retained as a workflow artifact.',
    ],
    evidence:
      'CI foundation: https://github.com/larai-w/medication-promise-app/commit/61dec5f · safety test expansion: https://github.com/larai-w/medication-promise-app/commit/83944bc',
    labels: ['story', 'evidence:backfill', 'area:delivery', 'P1'],
  },
  {
    title: '[Story] Maintainer can deploy the Next.js application on supported AWS infrastructure',
    story:
      'As the maintainer, I want a repeatable supported deployment path, so that the household Web workflow remains available without downgrading the application framework.',
    criteria: [
      'Next.js SSR and API routes deploy successfully.',
      'The runtime can read the existing DynamoDB table in its actual region.',
      'Production record create/read/delete smoke checks succeed.',
    ],
    evidence:
      'OpenNext/SST migration: https://github.com/larai-w/medication-promise-app/commit/fe91982 · verified handoff: https://github.com/larai-w/medication-promise-app/commit/3cb6270',
    labels: ['story', 'evidence:backfill', 'area:delivery', 'area:data', 'P0'],
  },
  {
    title: '[Story] Household medication records are protected from anonymous Web access',
    story:
      'As the current household, I want the Web app and APIs behind a private access gate, so that knowing the URL is not enough to read or change medication records.',
    criteria: [
      'Unauthenticated pages redirect to login and protected APIs return 401.',
      'The session cookie is signed, HTTP-only, Secure, and SameSite Strict.',
      'Record inputs and mutation requests are validated at the API boundary.',
      'The deployment is explicitly described as single-household, not multi-user.',
    ],
    evidence:
      'Security retrofit, tests, and release notes: https://github.com/larai-w/medication-promise-app/commit/83944bc',
    labels: ['story', 'evidence:backfill', 'area:web', 'area:safety', 'P0'],
  },
];

const backlogStories = [
  {
    title: '[Story] Household can configure the medication label and reminder times',
    story:
      'As a family caregiver, I want to configure the household medication label and five reminder times, so that the routine can match the current care plan without code changes.',
    criteria: [
      'A protected settings screen reads and saves the household configuration.',
      'The Alexa reminder intent reads the saved configuration.',
      'The user is told that reminders must be recreated after changing times.',
      'Web, Alexa, and production verification evidence is linked before closure.',
    ],
    risks:
      'The implementation currently exists as uncommitted/deployed work. Keep this issue open until the repository change is reviewed and committed. The application must not decide medication timing.',
    labels: ['story', 'area:web', 'area:alexa', 'area:safety', 'P1'],
    milestone: 'Limited Beta — Identity and Validation',
  },
  {
    title: '[Story] Each invited household has an isolated identity and data partition',
    story:
      'As an invited household, I want my own account and isolated records, so that no other household can access or change my medication history.',
    criteria: [
      'Authentication resolves a stable household identity on every request.',
      'DynamoDB keys are derived from the authenticated household, not a fixed default.',
      'Cross-household read, update, delete, PDF, and settings tests fail closed.',
      'The existing household is migrated with a tested rollback path.',
    ],
    risks:
      'This is the main beta release gate. A shared access code is not tenant isolation.',
    labels: ['story', 'area:web', 'area:data', 'area:safety', 'P0'],
    milestone: 'Limited Beta — Identity and Validation',
  },
  {
    title: '[Story] Alexa identity links to the correct invited household',
    story:
      'As an invited Alexa user, I want the skill linked to my household account, so that voice records and reminders cannot be written to another household.',
    criteria: [
      'Alexa account linking completes through the selected identity provider.',
      'The Lambda resolves the linked household for records and settings.',
      'Missing, expired, and mismatched links fail without writing data.',
      'Unlinking and relinking behaviour is documented and tested.',
    ],
    risks:
      'Do not begin a multi-household beta until this and Web isolation are both verified.',
    labels: ['story', 'area:alexa', 'area:data', 'area:safety', 'P0'],
    milestone: 'Limited Beta — Identity and Validation',
  },
  {
    title: '[Story] Product manager can evaluate a two-week invitation-only beta',
    story:
      'As the product manager, I want a small two-week beta with agreed measures, so that the next release decision is based on household value and risk evidence.',
    criteria: [
      'Three to five households receive clear onboarding, consent, and support boundaries.',
      'The team measures recording continuity, caregiver confirmation checks, corrections, and two-week retention.',
      'Data-isolation and safety incidents are reviewed with a target of zero.',
      'A documented go, iterate, or stop decision follows the beta.',
    ],
    risks:
      'Do not claim clinical outcomes or medication adherence improvement from this validation.',
    labels: ['story', 'area:docs', 'area:safety', 'P1'],
    milestone: 'Limited Beta — Identity and Validation',
  },
  {
    title: '[Story] Household can request data export and deletion',
    story:
      'As a household, I want a clear export and deletion process, so that I retain practical control over my records.',
    criteria: [
      'The household can export its own records in a documented format.',
      'Deletion covers records, settings, and linked identity data.',
      'Deletion is confirmed without exposing sensitive data in support channels.',
      'Retention and recovery implications are explained before confirmation.',
    ],
    risks:
      'Deletion must be tenant-scoped and tested against cross-household impact.',
    labels: ['story', 'area:data', 'area:safety', 'P0'],
    milestone: 'Public Readiness — Safety and Operations',
  },
  {
    title: '[Story] Maintainer can detect, recover from, and communicate production failures',
    story:
      'As the maintainer, I want observable releases and a tested recovery path, so that a failed deployment or data incident can be contained and explained.',
    criteria: [
      'Operational alarms cover Web and Alexa error paths without logging medication details.',
      'Backup and restore procedures are tested on non-production data.',
      'Rollback and public-disable procedures are documented.',
      'An incident template records impact, timeline, correction, and follow-up actions.',
    ],
    risks:
      'Logs and alerts must minimise health and identity data.',
    labels: ['story', 'area:delivery', 'area:data', 'area:safety', 'P1'],
    milestone: 'Public Readiness — Safety and Operations',
  },
];

const checkboxList = (items, checked) =>
  items.map((item) => `- [${checked ? 'x' : ' '}] ${item}`).join('\n');

const completedBody = (item) => `${evidenceNote}

## User story

${item.story}

## Acceptance criteria

${checkboxList(item.criteria, true)}

## Evidence

${item.evidence}

## Scope note

Completion applies to the single-household MVP. It does not demonstrate multi-household identity, clinical effectiveness, or public-release readiness.`;

const backlogBody = (item) => `## User story

${item.story}

## Acceptance criteria

${checkboxList(item.criteria, false)}

## Risks and non-goals

${item.risks}

## Definition of Done

- [ ] Automated verification passes.
- [ ] Human review and relevant production/device acceptance evidence are linked.
- [ ] Documentation and stated limitations match the released behaviour.`;

try {
  gh(['auth', 'status']);
} catch {
  console.error('GitHub CLI authentication is required. Run: gh auth login');
  process.exit(1);
}

console.log(`Repository: ${repository}${dryRun ? ' (dry-run)' : ''}`);

for (const [name, color, description] of labels) {
  run(`ensure label ${name}`, [
    'label',
    'create',
    name,
    '--repo',
    repository,
    '--color',
    color,
    '--description',
    description,
    '--force',
  ]);
}

const existingMilestones = JSON.parse(
  gh(['api', `repos/${repository}/milestones?state=all&per_page=100`]) || '[]'
);
const milestoneNumbers = new Map(existingMilestones.map((item) => [item.title, item.number]));

for (const milestone of milestones) {
  if (milestoneNumbers.has(milestone.title)) continue;
  if (dryRun) {
    console.log(`[dry-run] create milestone ${milestone.title}`);
    milestoneNumbers.set(milestone.title, 0);
    continue;
  }
  const created = JSON.parse(
    gh([
      'api',
      '--method',
      'POST',
      `repos/${repository}/milestones`,
      '-f',
      `title=${milestone.title}`,
      '-f',
      `description=${milestone.description}`,
    ])
  );
  milestoneNumbers.set(milestone.title, created.number);
}

const existingIssues = JSON.parse(
  gh([
    'issue',
    'list',
    '--repo',
    repository,
    '--state',
    'all',
    '--limit',
    '200',
    '--json',
    'title,url,number,state',
  ]) || '[]'
);
const issueByTitle = new Map(existingIssues.map((item) => [item.title, item]));
const createdUrls = [];

const ensureIssue = (item, completed) => {
  const existing = issueByTitle.get(item.title);
  if (existing) {
    console.log(`skip existing issue #${existing.number}: ${item.title}`);
    createdUrls.push(existing.url);
    return;
  }

  const milestone = completed
    ? 'Household MVP — Evidence Backfill'
    : item.milestone;
  const args = [
    'issue',
    'create',
    '--repo',
    repository,
    '--title',
    item.title,
    '--body',
    completed ? completedBody(item) : backlogBody(item),
    '--milestone',
    milestone,
  ];
  for (const label of item.labels) args.push('--label', label);

  if (dryRun) {
    console.log(`[dry-run] create ${completed ? 'completed' : 'open'} issue: ${item.title}`);
    return;
  }

  const url = gh(args);
  createdUrls.push(url);
  if (completed) {
    gh(['issue', 'close', url, '--reason', 'completed']);
  }
  console.log(`created: ${url}`);
};

for (const item of completedStories) ensureIssue(item, true);
for (const item of backlogStories) ensureIssue(item, false);

if (projectNumber) {
  for (const url of createdUrls) {
    run(`add ${url} to project ${projectNumber}`, [
      'project',
      'item-add',
      projectNumber,
      '--owner',
      owner,
      '--url',
      url,
    ]);
  }

  const project = JSON.parse(
    gh(['project', 'view', projectNumber, '--owner', owner, '--format', 'json'])
  );
  const fields = JSON.parse(
    gh(['project', 'field-list', projectNumber, '--owner', owner, '--format', 'json'])
  ).fields;
  const items = JSON.parse(
    gh([
      'project',
      'item-list',
      projectNumber,
      '--owner',
      owner,
      '--limit',
      '100',
      '--format',
      'json',
    ])
  ).items;

  const sizeByIssue = new Map([
    [1, 'M'],
    [2, 'S'],
    [3, 'M'],
    [4, 'M'],
    [5, 'M'],
    [6, 'M'],
    [7, 'S'],
    [8, 'L'],
    [9, 'L'],
    [10, 'M'],
    [11, 'XL'],
    [12, 'XL'],
    [13, 'M'],
    [14, 'L'],
    [15, 'L'],
  ]);
  const areaMap = new Map([
    ['area:web', 'Web'],
    ['area:alexa', 'Alexa'],
    ['area:data', 'Data'],
    ['area:delivery', 'Delivery'],
    ['area:docs', 'Docs'],
  ]);
  const targetMap = new Map([
    ['Household MVP — Evidence Backfill', 'Household MVP'],
    ['Limited Beta — Identity and Validation', 'Limited Beta'],
    ['Public Readiness — Safety and Operations', 'Public Readiness'],
  ]);

  const select = (item, fieldName, optionName) => {
    if (!optionName) return;
    const field = fields.find((candidate) => candidate.name === fieldName);
    const option = field?.options?.find((candidate) => candidate.name === optionName);
    if (!field || !option) {
      throw new Error(`Missing Project field option: ${fieldName} / ${optionName}`);
    }
    run(`set ${fieldName}=${optionName} on issue #${item.content.number}`, [
      'project',
      'item-edit',
      '--id',
      item.id,
      '--project-id',
      project.id,
      '--field-id',
      field.id,
      '--single-select-option-id',
      option.id,
    ]);
  };

  for (const item of items) {
    if (item.content?.type !== 'Issue') continue;
    const priority = item.labels.find((label) => /^P[0-3]$/.test(label));
    const areaLabel = item.labels.find((label) => areaMap.has(label));
    select(item, 'Priority', priority);
    select(item, 'Area', areaMap.get(areaLabel));
    select(item, 'Size', sizeByIssue.get(item.content.number));
    select(item, 'Target', targetMap.get(item.milestone?.title));
  }
}

console.log('\nPortfolio bootstrap complete.');
if (!projectNumber) {
  console.log('Re-run with --project <number> after creating the GitHub Project to add all issues.');
}
