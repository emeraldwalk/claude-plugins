# Claude Plugins

Claude Code mods and plugins, published as the `emeraldwalk` marketplace.

| Plugin | What it does |
| --- | --- |
| [session-outline](plugins/session-outline) | Footer toggle + side pane outlining the session: each prompt as an expandable thread of responses and tool calls |

## Install

At the prompt of a Claude Code terminal session:

```
/plugin install <plugin> --marketplace emeraldwalk/claude-plugins
```

From a shell:

```
claude plugin install <plugin> --marketplace emeraldwalk/claude-plugins
```

Answer `y` to add the marketplace, then pick a scope. In the desktop app: click + next to the prompt box, then Plugins, Add marketplace with `emeraldwalk/claude-plugins`, then Add plugin.

## Layout

```
.claude-plugin/marketplace.json   lists every plugin below
plugins/<name>/
  .claude-plugin/plugin.json      manifest
  hooks/hooks.json                { "modules": ["./register.tsx"] }
  hooks/register.tsx              the hooks module
  hooks/*.test.ts                 tests (claude plugin test)
  types/index.d.ts                $.state contract, when the mod keeps state
```

Adding a plugin: create `plugins/<name>/`, then add an entry to `.claude-plugin/marketplace.json` and a row to the table above.

## Developing

Load a plugin from its folder, with hot reload on save:

```
claude --plugin-dir plugins/<name>
```

or list folders in `CLAUDE_CODE_PLUGIN_DIRS` (in `~/.claude/settings.json` under `env`) for sessions where no flag can be given.

Check before committing:

```
claude plugin validate .                  # marketplace + every listed plugin
claude plugin validate plugins/<name>
claude plugin test plugins/<name>
```

Claude Code lays the API types into `plugins/<name>/.claude-plugin/types/` when it loads a plugin (ignored by git); each plugin's `tsconfig.json` extends them, so `tsc -p plugins/<name>` type-checks it after a load.
