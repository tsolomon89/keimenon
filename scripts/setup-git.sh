#!/bin/bash
# Git setup script for Canvas Memory OS

set -e

echo "🔧 Setting up Git for Canvas Memory OS..."
echo ""

# Check if Git is installed
if ! command -v git &> /dev/null; then
    echo "❌ Git is not installed. Please install Git first."
    exit 1
fi

# Check if we're in a Git repository
if [ ! -d .git ]; then
    echo "❌ Not a Git repository. Please run 'git init' first."
    exit 1
fi

echo "✅ Git repository detected"
echo ""

# Configure commit template
echo "📝 Configuring commit message template..."
git config commit.template .gitmessage
echo "✅ Commit template configured"
echo ""

# Configure pull strategy
echo "🔄 Configuring pull strategy..."
git config pull.rebase true
echo "✅ Pull strategy set to rebase"
echo ""

# Enable color output
echo "🎨 Enabling color output..."
git config color.ui auto
echo "✅ Color output enabled"
echo ""

# Configure default branch name
echo "🌿 Configuring default branch name..."
git config init.defaultBranch main
echo "✅ Default branch set to 'main'"
echo ""

# Check user configuration
USER_NAME=$(git config user.name || echo "")
USER_EMAIL=$(git config user.email || echo "")

if [ -z "$USER_NAME" ] || [ -z "$USER_EMAIL" ]; then
    echo "⚠️  Git user not configured"
    echo ""
    echo "Please configure your Git identity:"
    echo "  git config --global user.name \"Your Name\""
    echo "  git config --global user.email \"your.email@example.com\""
    echo ""
else
    echo "✅ Git user configured:"
    echo "   Name: $USER_NAME"
    echo "   Email: $USER_EMAIL"
    echo ""
fi

# Install dependencies and Git hooks
echo "📦 Installing dependencies and Git hooks..."
npm install
echo "✅ Dependencies and hooks installed"
echo ""

echo "🎉 Git setup complete!"
echo ""
echo "Next steps:"
echo "1. Review CONTRIBUTING.md for workflow guidelines"
echo "2. Create a feature branch: git checkout -b feature/your-feature"
echo "3. Make changes and commit using the template"
echo "4. Push and create a pull request"
echo ""
echo "For detailed workflow, see: docs/GIT_WORKFLOW.md"
