# Release Process

You are performing a release for the vibetracker npm package. Follow these steps exactly.

## Arguments

- `$ARGUMENTS` - The release type: "patch" or "minor"

## Step 1: Validate

1. Ensure we're on the main branch with a clean working tree
2. Pull the latest changes from origin
3. Run tests with `bun test` to ensure everything passes
4. Run typecheck with `bun run typecheck`

If any of these fail, stop and report the issue.

## Step 2: Bump Version

1. Read the current version from package.json
2. Based on `$ARGUMENTS`:
   - If "patch": bump the patch version (e.g., 0.1.0 -> 0.1.1)
   - If "minor": bump the minor version (e.g., 0.1.0 -> 0.2.0)
   - If neither "patch" nor "minor", ask the user which type of release they want
3. Update package.json with the new version
4. Report the version change to the user (e.g., "Bumping version from 0.1.0 to 0.1.1")

## Step 3: Create PR

1. Create a new branch named `release/v{NEW_VERSION}` (e.g., `release/v0.1.1`)
2. Commit the package.json change with message: `chore: bump version to {NEW_VERSION}`
3. Push the branch to origin
4. Create a PR with:
   - Title: `chore: release v{NEW_VERSION}`
   - Body: `## Release v{NEW_VERSION}\n\nBumps version from {OLD_VERSION} to {NEW_VERSION}.`

Report the PR URL to the user.

## Step 4: Wait for User Confirmation

Ask the user: "PR created. Would you like me to merge the PR and publish to npm?"

Wait for user confirmation before proceeding.

## Step 5: Merge and Publish

Once the user confirms:

1. Merge the PR using `gh pr merge --squash --delete-branch`
2. Switch back to main branch and pull the latest
3. Publish to npm using `bun publish --access public`
4. Create a git tag `v{NEW_VERSION}` and push it: `git tag v{NEW_VERSION} && git push origin v{NEW_VERSION}`

## Step 6: Complete

Report to the user:
- The new version that was published
- Link to the npm package: https://www.npmjs.com/package/vibetracker
- Link to the GitHub release tag

