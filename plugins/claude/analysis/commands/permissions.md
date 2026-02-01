# Permissions

Analyze your vibetracker database usage to determine what permissions to add to your project's `.claude/config.json`.

## vibetracker Database Schema

The vibetracker events database (typically at `~/.vibetracker/events.db`) contains an `events` table with these relevant columns for permissions:

- `tool_name`: Which Claude tools were used (bash, read, write, edit, glob, grep, etc.)
- `file_path`: Paths to files accessed
- `tool_input`: Commands executed (useful for detecting bash commands like git, npm, etc.)
- `event_type`: Type of event that occurred

## Quick Analysis Commands

To understand what permissions you need, run these queries against your database:

**List all tools used:**
```bash
sqlite3 ~/.vibetracker/events.db "SELECT DISTINCT tool_name FROM events WHERE tool_name IS NOT NULL;"
```

**List file paths accessed:**
```bash
sqlite3 ~/.vibetracker/events.db "SELECT DISTINCT file_path FROM events WHERE file_path IS NOT NULL LIMIT 20;"
```

**List bash commands used:**
```bash
sqlite3 ~/.vibetracker/events.db "SELECT DISTINCT tool_input FROM events WHERE tool_name='bash' LIMIT 20;"
```

**Count usage by tool:**
```bash
sqlite3 ~/.vibetracker/events.db "SELECT tool_name, COUNT(*) FROM events WHERE tool_name IS NOT NULL GROUP BY tool_name ORDER BY COUNT(*) DESC;"
```

## Generating Your config.json

Based on your analysis, create or update `.claude/config.json` with:

```json
{
  "tools": [
    "bash",
    "read",
    "write",
    "edit",
    "glob",
    "grep",
    "web_fetch",
    "task"
  ],
  "commands": {
    "git": {
      "description": "Git version control commands"
    },
    "npm": {
      "description": "Node package manager"
    }
  },
  "files": [
    "./**/*",
    "src/**/*.ts",
    "tests/**/*.ts"
  ]
}
```

## Tips

1. **Start permissive**: Use patterns like `./**/*` to allow access to the entire project during development
2. **Review regularly**: Run this command periodically to see what you're actually using
3. **Use patterns**: File glob patterns are better than listing individual files
4. **Commands**: If you use specific bash commands like `npm`, `yarn`, `make`, add them to the commands section

## Example Workflow

1. Run the analysis commands above to see what you've been using
2. Check if `.claude/config.json` exists: `ls .claude/config.json`
3. If it doesn't exist, create it based on the template above
4. If it exists, compare your current permissions with what the database shows you're using
5. Add any missing tools, commands, or file patterns
