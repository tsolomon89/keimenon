# Git Workflow Guide

This document describes the Git workflow and best practices for the Canvas Memory OS project.

## Table of Contents

- [Initial Setup](#initial-setup)
- [Branching Strategy](#branching-strategy)
- [Daily Workflow](#daily-workflow)
- [Pull Request Workflow](#pull-request-workflow)
- [Release Process](#release-process)
- [Common Scenarios](#common-scenarios)
- [Troubleshooting](#troubleshooting)

## Initial Setup

### 1. Configure Git

```bash
# Set your identity
git config --global user.name "Your Name"
git config --global user.email "your.email@example.com"

# Set commit template (from project root)
git config commit.template .gitmessage

# Configure default branch name
git config --global init.defaultBranch main

# Enable auto-correction
git config --global help.autocorrect 1

# Set pull strategy
git config --global pull.rebase true

# Enable color output
git config --global color.ui auto
```

### 2. Install Git Hooks

After cloning the repository:

```bash
npm install
npm run prepare
```

This installs Husky hooks that will:

- Run linting and formatting before commits
- Validate commit message format
- Run tests before push
- Ensure build succeeds before push

## Branching Strategy

We use **Git Flow** with the following branches:

### Permanent Branches

#### `main`

- Production-ready code
- Only accepts merges from `release/*` or `hotfix/*`
- Protected: requires PR and approvals
- Tagged with version numbers (e.g., `v1.2.3`)

#### `develop`

- Integration branch for next release
- Accepts merges from `feature/*`, `bugfix/*`, and `hotfix/*`
- Protected: requires PR and approvals
- Should always be in a stable state

### Temporary Branches

#### `feature/*`

- New features and enhancements
- Branch from: `develop`
- Merge back to: `develop`
- Naming: `feature/issue-number-description` or `feature/description`
- Example: `feature/123-add-oauth`, `feature/user-dashboard`

#### `bugfix/*`

- Non-critical bug fixes
- Branch from: `develop`
- Merge back to: `develop`
- Naming: `bugfix/issue-number-description`
- Example: `bugfix/456-fix-login-error`

#### `hotfix/*`

- Critical production fixes
- Branch from: `main`
- Merge back to: `main` AND `develop`
- Naming: `hotfix/version-description`
- Example: `hotfix/1.2.1-security-patch`

#### `release/*`

- Release preparation
- Branch from: `develop`
- Merge back to: `main` AND `develop`
- Naming: `release/version`
- Example: `release/1.3.0`

## Daily Workflow

### Starting a New Feature

```bash
# 1. Update develop branch
git checkout develop
git pull origin develop

# 2. Create feature branch
git checkout -b feature/my-new-feature

# 3. Work on your feature
# Make changes to files...

# 4. Stage and commit
git add .
git commit
# Follow the commit message template

# 5. Push to remote
git push -u origin feature/my-new-feature
```

### Working on an Existing Feature

```bash
# 1. Switch to feature branch
git checkout feature/my-feature

# 2. Get latest changes
git pull origin feature/my-feature

# 3. Update with latest develop (optional but recommended)
git fetch origin develop
git rebase origin/develop

# 4. Make changes and commit
git add .
git commit

# 5. Push changes
git push origin feature/my-feature
```

### Keeping Your Branch Updated

```bash
# Option 1: Rebase (preferred for cleaner history)
git fetch origin develop
git rebase origin/develop

# If conflicts occur:
# - Resolve conflicts in files
git add <resolved-files>
git rebase --continue

# Option 2: Merge
git fetch origin develop
git merge origin/develop
```

## Pull Request Workflow

### Creating a Pull Request

1. **Prepare Your Branch**

   ```bash
   # Ensure you're up to date
   git checkout feature/my-feature
   git fetch origin develop
   git rebase origin/develop

   # Run checks locally
   npm run lint
   npm run type-check
   npm test
   npm run build

   # Push final changes
   git push origin feature/my-feature
   ```

2. **Create PR on GitHub**
   - Go to repository on GitHub
   - Click "Pull requests" → "New pull request"
   - Select base: `develop`, compare: `feature/my-feature`
   - Fill out the PR template
   - Add reviewers and labels
   - Link related issues

3. **During Review**
   - Address feedback promptly
   - Make requested changes
   - Push additional commits
   - Respond to comments

4. **Before Merging**
   - Ensure all CI checks pass
   - Get required approvals
   - Resolve any conflicts
   - Squash fixup commits if needed

### Reviewing a Pull Request

```bash
# Fetch PR branch
git fetch origin pull/123/head:pr-123
git checkout pr-123

# Test the changes
npm install
npm run dev
npm test

# Leave comments on GitHub
```

## Release Process

### Creating a Release

1. **Create Release Branch**

   ```bash
   git checkout develop
   git pull origin develop
   git checkout -b release/1.3.0
   ```

2. **Prepare Release**

   ```bash
   # Update version in package.json
   npm version 1.3.0 --no-git-tag-version

   # Update CHANGELOG.md
   # Add release date and notes

   # Commit changes
   git add .
   git commit -m "chore(release): prepare version 1.3.0"
   ```

3. **Merge to Main**

   ```bash
   # Push release branch
   git push origin release/1.3.0

   # Create PR to main
   # After approval and merge:
   git checkout main
   git pull origin main
   git tag -a v1.3.0 -m "Release version 1.3.0"
   git push origin v1.3.0
   ```

4. **Back-merge to Develop**
   ```bash
   git checkout develop
   git merge main
   git push origin develop
   ```

### Hotfix Process

```bash
# 1. Create hotfix branch from main
git checkout main
git pull origin main
git checkout -b hotfix/1.2.1-critical-fix

# 2. Make the fix
# Fix the issue...
git add .
git commit -m "fix: critical security issue"

# 3. Update version
npm version patch --no-git-tag-version
git commit -am "chore: bump version to 1.2.1"

# 4. Merge to main
git checkout main
git merge hotfix/1.2.1-critical-fix
git tag -a v1.2.1 -m "Hotfix version 1.2.1"
git push origin main --tags

# 5. Merge to develop
git checkout develop
git merge hotfix/1.2.1-critical-fix
git push origin develop

# 6. Delete hotfix branch
git branch -d hotfix/1.2.1-critical-fix
```

## Common Scenarios

### Fixing a Mistake in Last Commit

```bash
# If you haven't pushed yet
git commit --amend

# If you have pushed
# Make the fix in a new commit instead
```

### Undoing Local Changes

```bash
# Discard changes to a file
git checkout -- <file>

# Discard all local changes
git reset --hard HEAD

# Undo last commit (keep changes)
git reset --soft HEAD~1

# Undo last commit (discard changes)
git reset --hard HEAD~1
```

### Stashing Work in Progress

```bash
# Save current changes
git stash save "WIP: feature description"

# List stashes
git stash list

# Apply most recent stash
git stash apply

# Apply and remove stash
git stash pop

# Apply specific stash
git stash apply stash@{2}
```

### Cherry-picking Commits

```bash
# Apply a specific commit to current branch
git cherry-pick <commit-hash>

# Cherry-pick without committing
git cherry-pick -n <commit-hash>
```

### Cleaning Up Branches

```bash
# Delete local branch
git branch -d feature/old-feature

# Force delete local branch
git branch -D feature/old-feature

# Delete remote branch
git push origin --delete feature/old-feature

# Prune deleted remote branches
git fetch --prune
```

## Troubleshooting

### Merge Conflicts

```bash
# When conflicts occur during merge/rebase
# 1. Open conflicted files and resolve conflicts
# 2. Stage resolved files
git add <resolved-files>

# 3. Continue merge/rebase
git merge --continue
# or
git rebase --continue

# Abort if needed
git merge --abort
# or
git rebase --abort
```

### Accidentally Committed to Wrong Branch

```bash
# 1. Create correct branch from current position
git branch feature/correct-branch

# 2. Reset current branch
git reset --hard HEAD~1

# 3. Switch to correct branch
git checkout feature/correct-branch
```

### Lost Commits

```bash
# Show reflog
git reflog

# Recover lost commit
git checkout <commit-hash>
git branch recovery-branch
```

### Squashing Commits Before Merge

```bash
# Interactive rebase last N commits
git rebase -i HEAD~3

# In the editor:
# - Keep first commit as "pick"
# - Change others to "squash" or "fixup"
# - Save and exit
```

## Best Practices

1. **Commit Often**: Make small, logical commits
2. **Write Good Messages**: Follow the commit message template
3. **Keep History Clean**: Use rebase for feature branches
4. **Test Before Push**: Run tests and linting locally
5. **Stay Updated**: Regularly sync with develop
6. **Review Your Changes**: Use `git diff` before committing
7. **Don't Push to Protected Branches**: Always use PRs
8. **Delete Merged Branches**: Keep repository clean
9. **Tag Releases**: Always tag production releases
10. **Document Breaking Changes**: Use commit footer for breaking changes

## Resources

- [Conventional Commits](https://www.conventionalcommits.org/)
- [Git Flow](https://nvie.com/posts/a-successful-git-branching-model/)
- [GitHub Flow](https://guides.github.com/introduction/flow/)
- [Pro Git Book](https://git-scm.com/book/en/v2)

## Getting Help

If you encounter issues:

1. Check this guide
2. Ask in team chat
3. Review GitHub Issues
4. Contact maintainers
