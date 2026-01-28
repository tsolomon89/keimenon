#!/bin/bash

# Keimenon - MCP Servers Installation Script (Linux/Mac)
# This script installs dependencies for all MCP servers

set -e  # Exit on error

echo "========================================"
echo "Keimenon - MCP Servers Setup"
echo "========================================"
echo ""

# Check Node.js
echo "[1/4] Checking Node.js installation..."
if ! command -v node &> /dev/null; then
    echo "ERROR: Node.js is not installed or not in PATH"
    echo "Please install Node.js 18+ from https://nodejs.org/"
    exit 1
fi
echo "✓ Node.js found: $(node --version)"
echo ""

# Check npm
echo "[2/4] Checking npm installation..."
if ! command -v npm &> /dev/null; then
    echo "ERROR: npm is not installed or not in PATH"
    exit 1
fi
echo "✓ npm found: $(npm --version)"
echo ""

# Install database server dependencies
echo "[3/4] Installing database server dependencies..."
cd servers/database
if [ ! -f package.json ]; then
    echo "ERROR: package.json not found in servers/database"
    exit 1
fi
npm install
echo "✓ Database server dependencies installed"
cd ../..
echo ""

# Install docs server dependencies
echo "[4/4] Installing docs server dependencies..."
cd servers/docs
if [ ! -f package.json ]; then
    echo "ERROR: package.json not found in servers/docs"
    exit 1
fi
npm install
echo "✓ Docs server dependencies installed"
cd ../..
echo ""

echo "========================================"
echo "Installation Complete!"
echo "========================================"
echo ""
echo "MCP servers are now ready to use."
echo ""
echo "Next steps:"
echo "1. Ensure the API server is running: cd apps/api && npm run dev"
echo "2. Restart VSCode to discover MCP servers"
echo "3. Open Claude Code and try: 'Get database stats'"
echo ""
echo "For usage instructions, see .mcp/USAGE_GUIDE.md"
echo ""
