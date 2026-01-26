# Canvas Memory OS - Documentation

**Welcome to Canvas Memory OS**, a local-first, graph-native memory operating system for research and knowledge management with advanced AI chat import capabilities.

This documentation hub provides comprehensive guides for users, developers, and system administrators.

---

## 📖 Documentation Navigator

### 🚀 Getting Started

Start here if you're new to Canvas Memory OS:

- **[Quick Start Guide](getting-started/QUICK_START.md)** - Get running in 5 minutes
- **[Installation Guide](getting-started/INSTALLATION.md)** - Detailed setup instructions
- **[Configuration](getting-started/CONFIGURATION.md)** - Environment variables and settings
- **[Troubleshooting](getting-started/TROUBLESHOOTING.md)** - Common issues and solutions

### 🏗️ Architecture

Understand how the system works:

- **[System Overview](architecture/OVERVIEW.md)** - High-level architecture and design
- **[Database Design](architecture/DATABASE.md)** - Neo4j + SQLite storage strategy
- **[API Design](architecture/API_DESIGN.md)** - REST API patterns and conventions
- **[Authentication System](architecture/AUTHENTICATION.md)** - Multi-tenant auth with JWT

### ✨ Features

Learn about specific features:

- **[Chat Import System](features/CHAT_IMPORT.md)** - Import ChatGPT, Claude, Gemini exports
- **[Code Extraction](features/CODE_EXTRACTION.md)** - Automatic code block extraction
- **[Grouping Engine](features/GROUPING_ENGINE.md)** - Content-addressable storage and grouping
- **[Clustering System](features/CLUSTERING.md)** - Policy-driven clustering and deduplication
- **[Export System](features/EXPORT_SYSTEM.md)** - Privacy-preserving exports
- **[Groups Navigation](features/GROUPS_NAVIGATION.md)** - Navigate groups and folders

### 💻 Development

_Note: Detailed development guides are currently being reconstructed. Please refer to `legacy_archive_2025/active_development` for recent context._

- **[Claude Protocol](development/CLAUDE_PROTOCOL.md)** - Operation guide for Claude Agents
- **[Gemini Protocol](development/GEMINI_PROTOCOL.md)** - Operation guide for Gemini Agents
- **[Contributing Guide](development/CONTRIBUTING.md)** - Contribution guidelines
- **[Testing Guide](legacy_archive_2025/testing/TESTING_CHECKLIST.md)** - Testing strategy (Archived)

### 🚀 Deployment

Running in production:

- **[Production Deployment](deployment/PRODUCTION.md)** - Production setup and best practices
- **[CI/CD Pipeline](deployment/CI_CD_PIPELINE.md)** - GitHub Actions workflow
- **[Playwright MCP](integrations/MCP_PLAYWRIGHT.md)** - E2E Testing Integration

### 📚 Technical Reference

Detailed specifications:

- **[Agents Architecture](specifications/AGENTS_ARCHITECTURE.md)** - AI Agents framework
- **[API Reference](specifications/API_REFERENCE.md)** - Complete REST API documentation
- **[Data Schemas](specifications/SCHEMAS.md)** - Zod schemas and type definitions
- **[Search Specification](features/SEARCH.md)** - Planned search engine

### 📜 Historical Archive

Project history and logs have been moved to `docs/legacy_archive_2025/`:

- **[Project History](legacy_archive_2025/project_history/)** - Status reports and session logs
- **[Active Development Logs](legacy_archive_2025/active_development/)**
- **[Historical Development](legacy_archive_2025/historical_development/)**

---

## 🎯 Quick Links by Role

### For End Users

1. [Quick Start](legacy_archive_2025/project_history/QUICK_START.md) - Get started in 5 minutes
2. [Chat Import](features/CHAT_IMPORT.md) - Import your conversations
3. [Troubleshooting](getting-started/TROUBLESHOOTING.md) - Fix common issues

### For Developers

1. [Architecture Overview](architecture/OVERVIEW.md) - Understand the system
2. [Claude Protocol](development/CLAUDE_PROTOCOL.md) - AI Agent guidelines
3. [API Reference](specifications/API_REFERENCE.md) - API documentation
4. [Contributing](development/CONTRIBUTING.md) - Contribution guidelines

### For System Administrators

1. [Installation Guide](getting-started/INSTALLATION.md) - Full installation
2. [Configuration](getting-started/CONFIGURATION.md) - Configure the system
3. [Production Deployment](deployment/PRODUCTION.md) - Deploy to production
4. [CI/CD Pipeline](deployment/CI_CD_PIPELINE.md) - Automated testing

### For Data Scientists

1. [Export System](features/EXPORT_SYSTEM.md) - Export data for analysis
2. [Clustering System](features/CLUSTERING.md) - Understand clustering algorithms
3. [Database Design](architecture/DATABASE.md) - Data model and schema

---

## 🔍 Finding What You Need

### By Task

| I want to...                | Read this                                                         |
| --------------------------- | ----------------------------------------------------------------- |
| Get started quickly         | [Quick Start](legacy_archive_2025/project_history/QUICK_START.md) |
| Install from scratch        | [Installation Guide](getting-started/INSTALLATION.md)             |
| Import chat conversations   | [Chat Import System](features/CHAT_IMPORT.md)                     |
| Understand the architecture | [System Overview](architecture/OVERVIEW.md)                       |
| Set up authentication       | [Authentication System](architecture/AUTHENTICATION.md)           |
| Deploy to production        | [Production Deployment](deployment/PRODUCTION.md)                 |
| Contribute code             | [Contributing Guide](development/CONTRIBUTING.md)                 |
| Run tests                   | [Testing Guide](legacy_archive_2025/testing/TESTING_CHECKLIST.md) |
| Troubleshoot issues         | [Troubleshooting](getting-started/TROUBLESHOOTING.md)             |
| Use the API                 | [API Reference](specifications/API_REFERENCE.md)                  |

### By Component

| Component               | Documentation                                                                              |
| ----------------------- | ------------------------------------------------------------------------------------------ |
| Database (Neo4j/SQLite) | [Database Design](architecture/DATABASE.md)                                                |
| Authentication          | [Authentication System](architecture/AUTHENTICATION.md)                                    |
| Chat Import             | [Chat Import System](features/CHAT_IMPORT.md)                                              |
| Grouping & Clustering   | [Grouping Engine](features/GROUPING_ENGINE.md), [Clustering](features/CLUSTERING.md)       |
| Code Extraction         | [Code Extraction](features/CODE_EXTRACTION.md)                                             |
| Export System           | [Export System](features/EXPORT_SYSTEM.md)                                                 |
| AI Agents               | [AI Agents](features/AI_AGENTS.md), [Architecture](specifications/AGENTS_ARCHITECTURE.md)  |
| Groups Navigation       | [Groups Navigation](features/GROUPS_NAVIGATION.md)                                         |
| REST API                | [API Design](architecture/API_DESIGN.md), [API Reference](specifications/API_REFERENCE.md) |

---

## 📝 Documentation Standards

All documentation in this project follows these principles:

- **DRY (Don't Repeat Yourself)**: Each concept is documented in exactly one place
- **Progressive Disclosure**: Start simple, provide links to deeper material
- **Audience-Aware**: Clearly marked sections for users, developers, admins
- **Searchable**: Consistent naming and clear hierarchies
- **Cross-Referenced**: Liberal use of markdown links between related topics
- **Executable Examples**: All code samples are tested and working
- **Up-to-Date**: Documentation is updated with code changes

---

## 🆘 Getting Help

1. **Check documentation**: Start with [Quick Start](getting-started/QUICK_START.md) or [Troubleshooting](getting-started/TROUBLESHOOTING.md)
2. **Search issues**: Look for similar issues on GitHub
3. **Create an issue**: If you found a bug or have a question
4. **Read the specs**: Check `ai_context/` for detailed specifications

---

## 🤝 Contributing to Documentation

Found an error or want to improve the docs?

1. Read the [Contributing Guide](development/CONTRIBUTING.md)
2. Make your changes
3. Ensure your changes follow the documentation standards above
4. Submit a pull request

All documentation improvements are welcome!

---

## 📦 Documentation Structure

```
docs/
├── README.md                    # This file - navigation hub
├── ROADMAP.md                   # Project Roadmap and Status
│
├── getting-started/             # New user onboarding
├── architecture/                # System design and patterns
├── features/                    # Feature-specific guides
├── deployment/                  # Production deployment
├── specifications/              # Technical reference
└── legacy_archive_2025/         # Archived development logs (historical)
```

---

**Last Updated**: 2025-10-15
**Status**: ✅ Documentation structure redesigned and consolidated
**Version**: 1.0.0
