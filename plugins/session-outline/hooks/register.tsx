import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, SessionMessage, ToolUseSummary } from 'claude-code'

const PANE = 'session-outline'
const TITLE = 'Outline'

const isOpen = atom({ plugin: 'session-outline', key: 'isOpen' } as const, false)
const revision = atom({ plugin: 'session-outline', key: 'revision' } as const, 0)
const expanded = atom({ plugin: 'session-outline', key: 'expanded' } as const, [])

type Item =
  | { kind: 'text'; key: string; text: string }
  | { kind: 'tools'; key: string; uses: ToolUseSummary[] }

type Thread = { key: string; prompt: string; items: Item[] }

const PREVIEW_LINES = 12

function isPrompt(message: SessionMessage): boolean {
  if (message.role !== 'user' || (message.toolResults?.length ?? 0) > 0) return false
  const text = message.text.trim()
  // Engine-injected rows (reminders, command records) open with a tag.
  return text !== '' && !text.startsWith('<')
}

// Tool calls with no reply text between them form one group, keyed by its
// first call so the key holds while the group grows.
function toThreads(messages: SessionMessage[]): Thread[] {
  const threads: Thread[] = []
  messages.forEach((message, index) => {
    if (isPrompt(message)) {
      threads.push({ key: `t${index}`, prompt: message.text.trim(), items: [] })
      return
    }
    const thread = threads.at(-1)
    if (thread === undefined || message.role !== 'assistant') return
    if (message.text.trim() !== '') {
      thread.items.push({ kind: 'text', key: `${thread.key}.m${index}`, text: message.text.trim() })
    }
    for (const use of message.toolUses) {
      const last = thread.items.at(-1)
      if (last?.kind === 'tools') {
        last.uses.push(use)
      } else {
        thread.items.push({ kind: 'tools', key: `${thread.key}.g${use.tool_use_id}`, uses: [use] })
      }
    }
  })
  return threads
}

function toolCount(thread: Thread): number {
  return thread.items.reduce((sum, item) => sum + (item.kind === 'tools' ? item.uses.length : 0), 0)
}

function shortName(tool: string): string {
  return tool.startsWith('mcp__') ? (tool.split('__').at(-1) ?? tool) : tool
}

function groupSummary(uses: ToolUseSummary[]): string {
  const counts = new Map<string, number>()
  for (const use of uses) counts.set(shortName(use.tool), (counts.get(shortName(use.tool)) ?? 0) + 1)
  return [...counts].map(([tool, n]) => (n > 1 ? `${tool} ×${n}` : tool)).join(', ')
}
function firstLine(text: string): string {
  return text.split('\n').find(line => line.trim() !== '')?.trim() ?? ''
}

function clip(text: string, width: number): string {
  const flat = text.replace(/\s+/g, ' ')
  return flat.length <= width ? flat : `${flat.slice(0, Math.max(1, width - 1))}…`
}

function toolSummary(use: ToolUseSummary): string {
  const input = use.input
  for (const field of ['command', 'file_path', 'pattern', 'url', 'query', 'description', 'prompt']) {
    const value = input[field]
    if (typeof value === 'string' && value !== '') return value
  }
  const anyString = Object.values(input).find(value => typeof value === 'string')
  return typeof anyString === 'string' ? anyString : ''
}

function preview(text: string): string[] {
  const lines = text.split('\n')
  const shown = lines.slice(0, PREVIEW_LINES)
  if (lines.length > PREVIEW_LINES) shown.push(`… ${lines.length - PREVIEW_LINES} more lines`)
  return shown
}

function toggleKey(key: string) {
  return (list: string[]) => (list.includes(key) ? list.filter(one => one !== key) : [...list, key])
}

async function togglePane($: EngineInterface) {
  const isUp = (await $.ui.panes()).some(pane => pane.id === PANE)
  if (isUp) {
    await $.ui.close({ id: PANE })
    return
  }
  await $.ui.open({ id: PANE, title: TITLE })
  await update($, isOpen, () => true)
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'outline',
      description: 'Toggle the session outline pane',
    })
    // A reload keeps the pane up; keep the footer's label in step with it.
    const isUp = (await $.ui.panes()).some(pane => pane.id === PANE)
    await update($, isOpen, () => isUp)

    return next(e)
  })

  on('command.run', { command: 'outline' }, async $ => {
    await togglePane($)
    const isUp = await read($, isOpen)

    return { text: isUp ? 'Outline pane opened.' : 'Outline pane closed.' }
  })

  on('ui.close', async ($, e, next) => {
    const result = await next(e)
    if (e.id === PANE) await update($, isOpen, () => false)

    return result
  }).catch(($, e, next) => next(e))

  // Every row the main conversation keeps redraws the outline.
  on('session.append', async ($, e, next) => {
    const result = await next(e)
    if (e.agentId === undefined) await update($, revision, n => n + 1)

    return result
  }).catch(($, e, next) => next(e))

  on('ui.render', { component: 'SessionMode' }, async ($, e) => {
    const { Box, Text, Button } = $.ui.resolve(e)
    const isUp = await read($, isOpen)
    const modes = e.props.modes

    return (
      <Box>
        {modes.length > 0 && <Text dimColor>{modes.join(' & ')} · </Text>}
        <Button key="outline-toggle" plain onPress={() => togglePane($)}>
          <Text dimColor={!isUp}>{isUp ? '◂ outline' : '▸ outline'}</Text>
        </Button>
      </Box>
    )
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button } = $.ui.resolve(e)
    await read($, revision)
    const open = await read($, expanded)
    const threads = toThreads(await $.session.messages())
    const width = Math.max(10, e.props.bodyColumns)

    const toggle = (key: string) => () => update($, expanded, toggleKey(key))
    const allOpen = threads.length > 0 && threads.every(thread => open.includes(thread.key))
    const mark = (key: string) => (open.includes(key) ? '▾' : '▸')

    const previewRows = (text: string, indent: string) =>
      preview(text).map(line => (
        <Text dimColor wrap="truncate-end">
          {indent}
          {line}
        </Text>
      ))

    const toolRow = (use: ToolUseSummary, key: string, indent: string) => {
      const state = use.isError ? ' ✗' : use.text === undefined ? ' …' : ''
      const head = `${indent}${mark(key)} » ${shortName(use.tool)}${state} `
      return (
        <Box key={`row:${key}`} flexDirection="column">
          <Button key={key} plain onPress={toggle(key)}>
            <Text color={use.isError ? 'red' : 'cyan'}>{head}</Text>
            <Text dimColor>{clip(toolSummary(use), width - head.length)}</Text>
          </Button>
          {open.includes(key) && previewRows(use.text ?? '(running)', `${indent}    `)}
        </Box>
      )
    }

    const itemRows = (thread: Thread, item: Item) => {
      if (item.kind === 'text') {
        const head = `   ${mark(item.key)} ↳ `
        return (
          <Box key={`row:${item.key}`} flexDirection="column">
            <Button key={item.key} plain onPress={toggle(item.key)}>
              {head}
              {clip(firstLine(item.text), width - head.length)}
            </Button>
            {open.includes(item.key) && previewRows(item.text, '       ')}
          </Box>
        )
      }
      const [only] = item.uses
      if (item.uses.length === 1 && only !== undefined) {
        return toolRow(only, `${thread.key}.${only.tool_use_id}`, '   ')
      }
      const errors = item.uses.filter(use => use.isError).length
      const isRunning = item.uses.some(use => use.text === undefined && !use.isError)
      const head = `   ${mark(item.key)} ${item.uses.length} tool calls `
      const state = `${errors > 0 ? ` ✗${errors}` : ''}${isRunning ? ' …' : ''}`
      return (
        <Box key={`row:${item.key}`} flexDirection="column">
          <Button key={item.key} plain onPress={toggle(item.key)}>
            <Text color="cyan">{head}</Text>
            <Text dimColor>{clip(`· ${groupSummary(item.uses)}`, width - head.length - state.length)}</Text>
            <Text color="red">{state}</Text>
          </Button>
          {open.includes(item.key) &&
            item.uses.map(use => toolRow(use, `${thread.key}.${use.tool_use_id}`, '      '))}
        </Box>
      )
    }

    return (
      <Box flexDirection="column">
        <Box>
          <Text dimColor>
            {threads.length} {threads.length === 1 ? 'prompt' : 'prompts'} ·{' '}
          </Text>
          <Button
            key="toggle-all"
            plain
            onPress={() =>
              update($, expanded, () => (allOpen ? [] : threads.map(thread => thread.key)))
            }
          >
            <Text dimColor>{allOpen ? 'collapse all' : 'expand all'}</Text>
          </Button>
        </Box>
        {threads.length === 0 && <Text dimColor>No prompts yet.</Text>}
        {threads.map((thread, n) => {
          const isThreadOpen = open.includes(thread.key)
          const tools = toolCount(thread)
          const label = `${mark(thread.key)} ${n + 1}. `
          const tail = tools > 0 ? ` (${tools})` : ''
          return (
            <Box key={`row:${thread.key}`} flexDirection="column">
              <Button key={thread.key} plain onPress={toggle(thread.key)}>
                <Text bold>{label}</Text>
                {clip(firstLine(thread.prompt), width - label.length - tail.length)}
                <Text dimColor>{tail}</Text>
              </Button>
              {isThreadOpen && thread.items.length === 0 && (
                <Text dimColor>    (no response yet)</Text>
              )}
              {isThreadOpen && thread.items.map(item => itemRows(thread, item))}
            </Box>
          )
        })}
      </Box>
    )
  })
}
