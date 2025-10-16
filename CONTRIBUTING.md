# Contributing to Canvas Memory OS

Thank you for your interest in contributing to Canvas Memory OS! This document provides guidelines and workflows for contributing to the project.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Git Workflow](#git-workflow)
- [Branch Naming Convention](#branch-naming-convention)
- [Commit Message Guidelines](#commit-message-guidelines)
- [Pull Request Process](#pull-request-process)
- [Code Style](#code-style)
- [Testing](#testing)

## Code of Conduct

- Be respectful and inclusive
- Provide constructive feedback
- Focus on what is best for the project and community

## Getting Started

1. Fork the repository
2. Clone your fork:
   ```bash
   git clone https://github.com/YOUR_USERNAME/ai_convo_parser.git
   cd ai_convo_parser
   ```
3. Add upstream remote:
   ```bash
   git remote add upstream https://github.com/ORIGINAL_OWNER/ai_convo_parser.git
   ```
4. Install dependencies:
   ```bash
   npm run setup
   ```
5. Configure Git commit template:
   ```bash
   git config commit.template .gitmessage
   ```

## Git Workflow

We follow the **Git Flow** branching model with the following branches:

### Main Branches

- `main` - Production-ready code. Protected branch.
- `develop` - Integration branch for features. Protected branch.

### Supporting Branches

- `feature/*` - New features
- `bugfix/*` - Bug fixes
- `hotfix/*` - Urgent production fixes
- `release/*` - Release preparation

### Workflow Steps

1. **Sync with upstream:**

   ```bash
   git checkout develop
   git fetch upstream
   git merge upstream/develop
   ```

2. **Create a feature branch:**

   ```bash
   git checkout -b feature/your-feature-name develop
   ```

3. **Make your changes and commit:**

   ```bash
   git add .
   git commit
   # Follow the commit message template
   ```

4. **Keep your branch updated:**

   ```bash
   git fetch upstream
   git rebase upstream/develop
   ```

5. **Push to your fork:**

   ```bash
   git push origin feature/your-feature-name
   ```

6. **Create a Pull Request** from your feature branch to `develop`

## Branch Naming Convention

Use the following prefixes for branch names:

- `feature/` - New features (e.g., `feature/add-user-auth`)
- `bugfix/` - Bug fixes (e.g., `bugfix/fix-login-redirect`)
- `hotfix/` - Critical fixes for production (e.g., `hotfix/security-patch`)
- `release/` - Release preparation (e.g., `release/v1.2.0`)
- `docs/` - Documentation updates (e.g., `docs/update-readme`)
- `refactor/` - Code refactoring (e.g., `refactor/optimize-parser`)
- `test/` - Test additions or updates (e.g., `test/add-api-tests`)

Branch names should be:

- Lowercase
- Use hyphens to separate words
- Descriptive and concise
- Include issue number when applicable (e.g., `feature/123-add-oauth`)

## Commit Message Guidelines

We follow the **Conventional Commits** specification:

### Format

```
<type>(<scope>): <subject>

<body>

<footer>
```

### Type

Must be one of:

- `feat` - A new feature
- `fix` - A bug fix
- `docs` - Documentation only changes
- `style` - Code style changes (formatting, missing semi-colons, etc.)
- `refactor` - Code change that neither fixes a bug nor adds a feature
- `perf` - Performance improvements
- `test` - Adding or updating tests
- `build` - Changes to build system or dependencies
- `ci` - Changes to CI configuration
- `chore` - Other changes that don't modify src or test files
- `revert` - Reverts a previous commit

### Scope

Optional. The scope should be the name of the affected module or feature:

- `api`
- `web`
- `parser`
- `auth`
- `db`
- `ui`

### Subject

- Use imperative, present tense: "change" not "changed" nor "changes"
- Don't capitalize first letter
- No period at the end
- Limit to 50 characters

### Body

- Wrap at 72 characters
- Explain what and why vs. how
- Use bullet points with "-" or "\*"

### Footer

- Reference issues: `Closes #123, #456`
- Breaking changes: `BREAKING CHANGE: description`

### Examples

```
feat(auth): add OAuth2 Google authentication

- Implement Google OAuth2 strategy
- Add user profile mapping
- Update auth middleware

Closes #42
```

```
fix(parser): handle empty conversation arrays

Previously, the parser would crash when encountering empty arrays.
This fix adds validation and returns an empty result set.

Closes #78
```

```
docs(readme): update installation instructions

BREAKING CHANGE: Node.js 18+ is now required
```

## Pull Request Process

1. **Before Creating a PR:**
   - Ensure all tests pass: `npm test`
   - Run type checking: `npm run type-check`
   - Run linting: `npm run lint`
   - Build successfully: `npm run build`
   - Update documentation if needed

2. **Creating the PR:**
   - Use the PR template
   - Provide a clear description of changes
   - Link related issues
   - Add screenshots for UI changes
   - Request reviews from maintainers

3. **During Review:**
   - Respond to feedback promptly
   - Make requested changes
   - Keep the PR focused and small
   - Squash fixup commits before merge

4. **Merging:**
   - PRs require at least one approval
   - All CI checks must pass
   - Merge conflicts must be resolved
   - Use "Squash and merge" for feature branches
   - Use "Merge commit" for release branches

## Code Style

- Follow the existing code style
- Use TypeScript for type safety
- Use ESLint and Prettier (configuration provided)
- Write meaningful variable and function names
- Add comments for complex logic
- Keep functions small and focused

### File Organization

```
apps/
  api/          # Backend API
  web/          # Frontend application
packages/
  parser/       # Core parsing logic
  shared/       # Shared utilities
```

## Testing

- Write tests for new features
- Update tests for bug fixes
- Maintain or improve code coverage
- Use descriptive test names
- Follow the AAA pattern (Arrange, Act, Assert)

### Running Tests

```bash
# Run all tests
npm test

# Run tests in watch mode
npm test -- --watch

# Run tests with coverage
npm test -- --coverage

# Run specific test file
npm test -- path/to/test.test.ts
```

## Development Commands

```bash
# Setup project
npm run setup

# Start development servers
npm run dev

# Clean development servers
npm run dev:clean

# Stop development servers
npm run dev:stop

# Run type checking
npm run type-check

# Run linting
npm run lint

# Build for production
npm run build

# Validate environment
npm run validate

# Run authentication tests
npm test:auth
```

## Getting Help

- Check existing issues and discussions
- Review documentation in `/ai_context`
- Ask questions in pull requests or issues
- Contact maintainers

## License

By contributing, you agree that your contributions will be licensed under the same license as the project.

---

Thank you for contributing to Canvas Memory OS!
