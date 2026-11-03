# N|Solid release automation

This document describes the GitHub Actions automation that tracks Node.js
releases and prepares N|Solid release proposal pull requests.

The automation is intentionally small. A releaser should be able to run it from
the GitHub Actions UI by selecting only the Node.js release line.

## What it does

The automation has two workflows:

* `Watch Node.js Releases`
  * runs on a schedule and can also be started manually;
  * reads `.github/nsolid-release-lines.json`;
  * checks the latest stable Node.js release for each configured line;
  * skips the release if an N|Solid release branch or tag already exists;
  * creates or reuses a tracking issue;
  * attempts to create the release proposal.
* `Create N|Solid Release Proposal`
  * is manually started with one input: `node-line`;
  * finds the latest stable Node.js tag for that line;
  * checks out `node-v<line>.x-nsolid-v6.x`;
  * reads the current N|Solid version from `src/node_version.h`;
  * creates `node-vX.Y.Z-nsolid-vA.B.C-release`;
  * merges the upstream Node.js tag;
  * sets `NSOLID_VERSION_IS_RELEASE` to `1`;
  * prepends the N|Solid changelog entry;
  * pushes the release branch;
  * opens a draft release PR.

If the Node.js tag merge conflicts, the workflow stops, comments on the
tracking issue when one exists, and uploads `nsolid-release-conflicts.md` as an
artifact.

The automation does not create a release tag. Release tags should still be
created by the releaser after the proposal is reviewed.

## Supported release lines

The supported lines are configured in `.github/nsolid-release-lines.json`:

```json
{
  "nodeReleaseLines": [22, 24]
}
```

Only lines listed there are watched by the scheduled workflow and shown in the
manual workflow selector.

## Add a release line

When N|Solid starts supporting a new Node.js release line:

1. Add the major version to `.github/nsolid-release-lines.json`.
2. Add the same value to the `node-line` options in
   `.github/workflows/create-nsolid-release-proposal.yml`.
3. Ensure the base branch exists:
   `node-v<line>.x-nsolid-v6.x`.
4. Ensure the N|Solid changelog exists:
   `doc/changelogs/NSOLID_CHANGELOG_V6_NODE_V<line>.md`.
5. Run the workflow manually once for that line.

For example, to add Node.js v26 support, add `26` to the JSON file and add
`'26'` to the workflow options.

## Remove a release line

When N|Solid stops supporting a Node.js release line:

1. Remove the major version from `.github/nsolid-release-lines.json`.
2. Remove the same value from the `node-line` options in
   `.github/workflows/create-nsolid-release-proposal.yml`.

Do not delete existing release branches, tags, or changelog files as part of
removing the line from automation.

## Manual use

To prepare a release proposal manually:

1. Open the `Create N|Solid Release Proposal` workflow.
2. Select the Node.js release line.
3. Run the workflow.

The workflow always uses the latest stable Node.js release for the selected
line. If a different upstream tag is required, prepare the release manually.

## Failure handling

If the release branch already exists and has an open PR, the workflow reuses the
existing PR. If the release branch exists without an open PR, the workflow fails
so a releaser can inspect the branch before opening a PR manually.

If the workflow fails with merge conflicts:

1. Open the workflow artifact named `nsolid-release-conflicts`.
2. Resolve the listed conflicts locally from the generated release branch steps.
3. Continue the release manually.

If the workflow fails while creating the PR, the release branch may already have
been pushed. Open the PR manually using the branch named in the workflow logs.
