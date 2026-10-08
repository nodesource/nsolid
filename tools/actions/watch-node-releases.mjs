#!/usr/bin/env node

import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';

const CONFIG_PATH = '.github/nsolid-release-lines.json';
const NODE_RELEASE_INDEX_URL = process.env.NODE_RELEASE_INDEX_URL ||
  'https://nodejs.org/download/release/index.json';

const repository = process.env.GITHUB_REPOSITORY;
const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;

async function githubRequest(path, options = {}) {
  if (!repository) throw new Error('GITHUB_REPOSITORY is required');
  if (!token) throw new Error('GITHUB_TOKEN or GH_TOKEN is required');

  const response = await fetch(`https://api.github.com${path}`, {
    ...options,
    headers: {
      accept: 'application/vnd.github+json',
      authorization: `Bearer ${token}`,
      'x-github-api-version': '2022-11-28',
      ...(options.headers || {}),
    },
  });

  if (response.status === 204) return null;

  const text = await response.text();
  const body = text ? JSON.parse(text) : null;
  if (!response.ok) {
    const error = new Error(`GitHub API ${response.status} for ${path}`);
    error.status = response.status;
    error.body = body;
    throw error;
  }
  return body;
}

async function findIssue(title) {
  const query = new URLSearchParams({
    q: `repo:${repository} is:issue in:title "${title.replaceAll('"', '\\"')}"`,
    per_page: '100',
  });
  const result = await githubRequest(`/search/issues?${query}`);
  return result.items.find((issue) => !issue.pull_request && issue.title === title);
}

async function createIssue(title, body, labels) {
  try {
    return await githubRequest(`/repos/${repository}/issues`, {
      method: 'POST',
      body: JSON.stringify({ title, body, labels }),
    });
  } catch (error) {
    if (error.status !== 422) throw error;
    return githubRequest(`/repos/${repository}/issues`, {
      method: 'POST',
      body: JSON.stringify({ title, body }),
    });
  }
}

async function releaseAlreadyExists(nodeTag) {
  const branches = await githubRequest(
    `/repos/${repository}/git/matching-refs/heads/node-${nodeTag}-nsolid-v`,
  );
  if (branches.length > 0) return true;

  const tags = await githubRequest(
    `/repos/${repository}/git/matching-refs/tags/node-${nodeTag}-nsolid-v`,
  );
  return tags.length > 0;
}

function latestReleaseForLine(releases, line) {
  return releases
    .map((release) => release.version)
    .filter((version) => new RegExp(`^v${line}\\.\\d+\\.\\d+$`).test(version))
    .sort((a, b) => {
      const left = a.slice(1).split('.').map(Number);
      const right = b.slice(1).split('.').map(Number);
      for (let i = 0; i < 3; i++) {
        if (left[i] !== right[i]) return right[i] - left[i];
      }
      return 0;
    })[0];
}

function buildIssueBody(line, nodeTag) {
  return `## Release candidate

- Node.js tag: \`${nodeTag}\`
- Base branch: \`node-v${line}.x-nsolid-v6.x\`

The workflow will try to create the release PR automatically. If the merge conflicts, it will report the conflicted files here.
`;
}

async function fetchJsonWithTimeout(url) {
  const timeoutMs = Number(process.env.RELEASE_INDEX_TIMEOUT_MS || 30000);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) {
      throw new Error(`Failed to fetch ${url}: ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new Error(`Timed out fetching ${url} after ${timeoutMs}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

const config = JSON.parse(await readFile(CONFIG_PATH, 'utf8'));
const lines = config.nodeReleaseLines;
if (!Array.isArray(lines) || lines.length === 0) {
  throw new Error(`No release lines configured in ${CONFIG_PATH}`);
}

const releases = await fetchJsonWithTimeout(NODE_RELEASE_INDEX_URL);

for (const line of lines) {
  const nodeTag = latestReleaseForLine(releases, line);
  if (!nodeTag) {
    console.log(`No stable Node.js release found for v${line}.`);
    continue;
  }

  const title = `N|Solid release: Node.js ${nodeTag}`;
  if (await releaseAlreadyExists(nodeTag)) {
    console.log(`N|Solid release branch or tag already exists for ${nodeTag}; skipping.`);
    continue;
  }

  const existingIssue = await findIssue(title);
  const issue = existingIssue || await createIssue(
    title,
    buildIssueBody(line, nodeTag),
    ['release', 'automation', `node-v${line}`],
  );

  console.log(`${existingIssue ? 'Found' : 'Created'} issue #${issue.number}: ${issue.html_url}`);

  const result = spawnSync('tools/actions/create-nsolid-release-proposal.sh', {
    stdio: 'inherit',
    env: {
      ...process.env,
      NODE_LINE: String(line),
      NODE_TAG: nodeTag,
      ISSUE_NUMBER: String(issue.number),
    },
  });

  if (result.error) {
    throw result.error;
  }

  if (result.signal) {
    throw new Error(`Release proposal for ${nodeTag} was terminated by ${result.signal}`);
  }

  if (result.status !== 0) {
    process.exitCode = result.status;
  }
}
