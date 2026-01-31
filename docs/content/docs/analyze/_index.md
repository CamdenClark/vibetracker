---
title: "Analyze"
weight: 3
---

# Analyze

Vibetracker includes analysis plugins that help you understand your coding sessions and optimize your workflow.

## Install the Analysis Plugin

First, ensure you have the Vibetracker plugin marketplace added:

```bash
/plugin marketplace add camdenclark/vibetracker-plugins
```

Then install the analysis plugin:

```bash
/plugin install analysis
```

## Available Commands

### `/permissions`

The `/permissions` command analyzes your Vibetracker database to recommend permissions for your project. It examines tool usage patterns across your sessions and suggests appropriate permissions to add to your `.claude/config.json`.

This helps you:
- Identify which tools are commonly used in a project
- Generate permission configurations based on actual usage
- Reduce permission prompts by pre-approving common operations

## Requirements

The analysis plugin requires:
- [Vibetracker tracker plugin]({{< relref "/docs/installation/claude" >}}) installed and capturing session data
- At least one captured session to analyze
