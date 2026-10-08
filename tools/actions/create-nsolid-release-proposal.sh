#!/bin/sh

set -eu

CONFIG_PATH="${CONFIG_PATH:-.github/nsolid-release-lines.json}"
NODE_RELEASE_INDEX_URL="${NODE_RELEASE_INDEX_URL:-https://nodejs.org/download/release/index.json}"
NODE_LINE="${NODE_LINE:-}"
ISSUE_NUMBER="${ISSUE_NUMBER:-}"
GITHUB_REPOSITORY="${GITHUB_REPOSITORY:-}"
export NODE_RELEASE_INDEX_URL

if [ -z "$NODE_LINE" ]; then
  echo "Usage: NODE_LINE=22 $0" >&2
  exit 1
fi

node -e '
  const fs = require("node:fs");
  const [configPath, nodeLine] = process.argv.slice(1);
  const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
  if (!config.nodeReleaseLines.map(String).includes(nodeLine)) {
    throw new Error(`Node.js v${nodeLine} is not enabled in ${configPath}`);
  }
' "$CONFIG_PATH" "$NODE_LINE"

latest_node_tag() {
  node -e '
    const line = Number(process.argv[1]);
    const url = process.env.NODE_RELEASE_INDEX_URL;
    const timeoutMs = Number(process.env.RELEASE_INDEX_TIMEOUT_MS || 30000);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    let releases;
    try {
      const response = await fetch(url, { signal: controller.signal });
      if (!response.ok) throw new Error(`Failed to fetch ${url}: ${response.status}`);
      releases = await response.json();
    } catch (error) {
      if (error.name === "AbortError") {
        throw new Error(`Timed out fetching ${url} after ${timeoutMs}ms`);
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
    const stable = releases
      .map((release) => release.version)
      .filter((version) => new RegExp(`^v${line}\\.\\d+\\.\\d+$`).test(version))
      .sort((a, b) => {
        const left = a.slice(1).split(".").map(Number);
        const right = b.slice(1).split(".").map(Number);
        for (let i = 0; i < 3; i++) {
          if (left[i] !== right[i]) return right[i] - left[i];
        }
        return 0;
      });
    if (stable.length === 0) throw new Error(`No stable Node.js v${line} release found`);
    console.log(stable[0]);
  ' "$NODE_LINE"
}

BASE_BRANCH="node-v${NODE_LINE}.x-nsolid-v6.x"
CHANGELOG_PATH="doc/changelogs/NSOLID_CHANGELOG_V6_NODE_V${NODE_LINE}.md"
NODE_TAG="${NODE_TAG:-$(latest_node_tag)}"
NODE_VERSION="${NODE_TAG#v}"
RELEASE_DATE="${RELEASE_DATE:-$(date -u +%F)}"
CONFLICT_REPORT="nsolid-release-conflicts.md"

node -e '
  const [nodeLine, nodeTag] = process.argv.slice(1);
  const pattern = new RegExp(`^v${nodeLine}\\.\\d+\\.\\d+$`);
  if (!pattern.test(nodeTag)) {
    throw new Error(`Latest Node.js tag for v${nodeLine} is invalid: ${nodeTag}`);
  }
' "$NODE_LINE" "$NODE_TAG"

comment_issue() {
  body_file="$1"
  if [ -n "$ISSUE_NUMBER" ] && [ -n "${GH_TOKEN:-${GITHUB_TOKEN:-}}" ]; then
    gh issue comment "$ISSUE_NUMBER" --repo "$GITHUB_REPOSITORY" --body-file "$body_file" || true
  fi
}

write_conflict_report() {
  {
    echo "## Release proposal merge conflict"
    echo
    echo "- Base branch: \`$BASE_BRANCH\`"
    echo "- Upstream Node.js tag: \`$NODE_TAG\`"
    echo "- Release branch: \`$RELEASE_BRANCH\`"
    echo
    echo "The merge could not be completed automatically. No release PR was opened."
    echo
    echo "### Conflicted files"
    echo
    git diff --name-only --diff-filter=U | sed 's/^/- `/' | sed 's/$/`/'
    echo
    echo "### Git status"
    echo
    echo '```text'
    git status --short
    echo '```'
  } > "$CONFLICT_REPORT"
}

git config --local user.email "${GIT_AUTHOR_EMAIL:-nsolid-bot@nodesource.com}"
git config --local user.name "${GIT_AUTHOR_NAME:-N|Solid GitHub Bot}"

git fetch --no-tags origin "$BASE_BRANCH"
git remote add nodejs https://github.com/nodejs/node.git 2>/dev/null || true
git fetch --no-tags nodejs "refs/tags/${NODE_TAG}:refs/tags/${NODE_TAG}"

git switch --detach "origin/$BASE_BRANCH"
NSOLID_VERSION="$(python3 tools/getnsolidversion.py)"
RELEASE_BRANCH="node-${NODE_TAG}-nsolid-v${NSOLID_VERSION}-release"

git fetch --no-tags origin "+refs/heads/${RELEASE_BRANCH}:refs/remotes/origin/${RELEASE_BRANCH}" 2>/dev/null || true
if git rev-parse --verify "origin/${RELEASE_BRANCH}" >/dev/null 2>&1; then
  EXISTING_PR_URL="$(gh pr list \
    --repo "$GITHUB_REPOSITORY" \
    --head "$RELEASE_BRANCH" \
    --base "$BASE_BRANCH" \
    --state open \
    --json url \
    --jq '.[0].url' || true)"
  if [ -n "$EXISTING_PR_URL" ]; then
    COMMENT_BODY="nsolid-release-success.md"
    {
      echo "## Release proposal already exists"
      echo
      echo "- PR: $EXISTING_PR_URL"
      echo "- Release branch: \`$RELEASE_BRANCH\`"
    } > "$COMMENT_BODY"
    comment_issue "$COMMENT_BODY"
    echo "$EXISTING_PR_URL"
    exit 0
  fi
  echo "Release branch origin/${RELEASE_BRANCH} already exists, but no open PR was found." >&2
  exit 1
fi

git switch -c "$RELEASE_BRANCH"

if ! git merge "$NODE_TAG" --no-edit; then
  write_conflict_report
  comment_issue "$CONFLICT_REPORT"
  echo "::error::Merge conflict while merging $NODE_TAG into $BASE_BRANCH"
  exit 2
fi

node -e '
  const fs = require("node:fs");
  const path = "src/node_version.h";
  const text = fs.readFileSync(path, "utf8");
  const next = text.replace(
    /#define NSOLID_VERSION_IS_RELEASE [01]/,
    "#define NSOLID_VERSION_IS_RELEASE 1",
  );
  if (text === next) {
    throw new Error("Could not update NSOLID_VERSION_IS_RELEASE");
  }
  fs.writeFileSync(path, next);
'

CODENAME="$(awk '/#define NODE_VERSION_LTS_CODENAME / { gsub(/"/, "", $3); print $3; exit }' src/node_version.h)"
MERGE_SHA="$(git rev-parse --short=10 HEAD)"
MERGE_SUBJECT="$(git log -1 --format=%s)"
MERGE_AUTHOR="$(git log -1 --format=%an)"

node -e '
  const fs = require("node:fs");
  const [
    changelogPath,
    releaseDate,
    nodeVersion,
    nsolidVersion,
    codename,
    mergeSha,
    mergeSubject,
    mergeAuthor,
  ] = process.argv.slice(1);
  const text = fs.readFileSync(changelogPath, "utf8");
  const displayCodename = codename ? " \x27" + codename + "\x27" : "";
  const entry = `## ${releaseDate}, Version ${nodeVersion}-nsolid-v${nsolidVersion}${displayCodename}

### Commits

* \\[[\`${mergeSha}\`](https://github.com/nodesource/nsolid/commit/${mergeSha})] - ${mergeSubject} (${mergeAuthor})

`;
  fs.writeFileSync(changelogPath, entry + text);
' "$CHANGELOG_PATH" "$RELEASE_DATE" "$NODE_VERSION" "$NSOLID_VERSION" "$CODENAME" "$MERGE_SHA" "$MERGE_SUBJECT" "$MERGE_AUTHOR"

git add src/node_version.h "$CHANGELOG_PATH"
git commit -m "${RELEASE_DATE}, Version ${NODE_VERSION}-nsolid-v${NSOLID_VERSION} '${CODENAME}'"

git push origin "$RELEASE_BRANCH"

PR_BODY="nsolid-release-pr-body.md"
{
  echo "Release PR for Node.js ${NODE_TAG} with N|Solid v${NSOLID_VERSION}."
  echo
  echo "Generated by the N|Solid release workflow."
} > "$PR_BODY"

PR_URL="$(gh pr create \
  --repo "$GITHUB_REPOSITORY" \
  --base "$BASE_BRANCH" \
  --head "$RELEASE_BRANCH" \
  --title "${RELEASE_DATE}, Version ${NODE_VERSION}-nsolid-v${NSOLID_VERSION} '${CODENAME}'" \
  --body-file "$PR_BODY" \
  --draft)"

COMMENT_BODY="nsolid-release-success.md"
{
  echo "## Release proposal created"
  echo
  echo "- PR: $PR_URL"
  echo "- Release branch: \`$RELEASE_BRANCH\`"
  echo "- Release tag: not created by automation"
} > "$COMMENT_BODY"
comment_issue "$COMMENT_BODY"

echo "$PR_URL"
