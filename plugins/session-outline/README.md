# session-outline

An outline of the current Claude Code session in a side pane.

- **Footer toggle**: `▸ outline` at the right of the prompt footer (beside mode labels such as `focus`) opens and closes the pane. `/outline` does the same from the keyboard.
- **Threads**: one row per prompt, with its first line and tool-call count. Expand a row to see Claude's replies (`↳`) and tool calls (`» Bash npm test`; `✗` on error, `…` while running), and expand those for up to 12 lines of text or result.
- **Tool groups**: consecutive tool calls with no reply between them collapse into one row (`3 tool calls · Read ×2, Bash ✗1`); expand it to list the calls. A lone call stays a plain row.
- **expand all / collapse all** at the top.

The pane docks beside the transcript in fullscreen mode at 110+ columns; otherwise it opens above the prompt. Clicking needs the fullscreen terminal's mouse support; elsewhere use `/outline`, ctrl+x tab into the pane and Tab through its rows.

## Install

```
/plugin install session-outline --marketplace emeraldwalk/claude-plugins
```

## Limitations

- Subagent transcripts are not broken out: an `Agent` call is one tool row.
- User rows starting with `<` are treated as engine-injected and skipped.
