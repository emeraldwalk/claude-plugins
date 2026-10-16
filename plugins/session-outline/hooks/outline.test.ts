import { expect, test } from 'claude-code/testing'
import type { SessionMessage } from 'claude-code'

const MESSAGES: SessionMessage[] = [
  { role: 'user', text: 'Fix the failing test\nin the parser', toolUses: [] },
  {
    role: 'assistant',
    text: 'Let me run the tests first.',
    toolUses: [
      { tool_use_id: 'tu1', tool: 'Bash', input: { command: 'npm test' }, text: '1 failing' },
    ],
  },
  { role: 'user', text: '', toolUses: [], toolResults: [] },
  {
    role: 'assistant',
    text: 'Fixed it.',
    toolUses: [
      { tool_use_id: 'tu2', tool: 'Edit', input: { file_path: 'src/parse.ts' }, text: 'ok' },
    ],
  },
  { role: 'user', text: '<system-reminder>ignored</system-reminder>', toolUses: [] },
  { role: 'user', text: 'Now commit it', toolUses: [] },
]

const PANE = {
  component: 'Pane',
  requestId: 'session-outline',
  viewport: { columns: 120, rows: 40, isFullscreen: true },
  props: {
    title: 'Outline',
    isFocused: false,
    bodyColumns: 50,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 30 },
    view: {},
  },
} as const

test('the pane groups prompts into expandable threads', async ($, on) => {
  on('session.messages', () => ({ value: MESSAGES }))

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ plugin: 'session-outline', surface, ...PANE })

    expect(await ui.find({ text: /2 prompts/ })).toBeDefined()
    expect((await ui.find({ key: 't0' }))?.text).toContain('Fix the failing test')
    expect((await ui.find({ key: 't5' }))?.text).toContain('Now commit it')
    expect((await ui.find({ key: 't0' }))?.text).toContain('(2)')
    expect(await ui.find({ key: 't0.tu1' })).toBeUndefined()

    await ui.press({ key: 't0' })
    expect((await ui.find({ key: 't0.tu1' }))?.text).toContain('npm test')
    expect((await ui.find({ key: 't0.m1' }))?.text).toContain('Let me run the tests')
    expect(await ui.find({ text: /1 failing/ })).toBeUndefined()

    await ui.press({ key: 't0.tu1' })
    expect(await ui.find({ text: /1 failing/ })).toBeDefined()

    await ui.press({ key: 'toggle-all' })
    expect(await ui.find({ text: /collapse all/ })).toBeDefined()
    expect(await ui.find({ text: /no response yet/ })).toBeDefined()

    await ui.press({ key: 'toggle-all' })
    expect(await ui.find({ text: /expand all/ })).toBeDefined()
    expect(await ui.find({ key: 't0.tu1' })).toBeUndefined()

    await ui.unmount()
  }
})

test('the footer keeps the session modes and adds the toggle', async $ => {
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({
      plugin: 'session-outline',
      surface,
      component: 'SessionMode',
      requestId: 'mode',
      props: { modes: ['focus'] },
    })

    expect(await ui.find({ text: /focus/ })).toBeDefined()
    expect((await ui.find({ key: 'outline-toggle' }))?.text).toContain('outline')

    await ui.unmount()
  }
})

test('consecutive tool calls collapse into one group', async ($, on) => {
  const use = (id: string, tool: string, input: Record<string, unknown>, extra = {}) => ({
    tool_use_id: id,
    tool,
    input,
    text: 'ok',
    ...extra,
  })
  on('session.messages', () => ({
    value: [
      { role: 'user', text: 'Look around', toolUses: [] },
      {
        role: 'assistant',
        text: 'Reading.',
        toolUses: [use('a', 'Read', { file_path: 'a.ts' }), use('b', 'Read', { file_path: 'b.ts' })],
      },
      { role: 'user', text: '', toolUses: [], toolResults: [] },
      {
        role: 'assistant',
        text: '',
        toolUses: [use('c', 'Bash', { command: 'false' }, { isError: true, text: 'exit 1' })],
      },
      { role: 'assistant', text: 'Done.', toolUses: [use('d', 'Edit', { file_path: 'c.ts' })] },
    ] satisfies SessionMessage[],
  }))

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ plugin: 'session-outline', surface, ...PANE })
    await ui.press({ key: 't0' })

    const group = (await ui.find({ key: 't0.ga' }))?.text
    expect(group).toContain('3 tool calls')
    expect(group).toContain('Read ×2, Bash')
    expect(group).toContain('✗1')
    expect(await ui.find({ key: 't0.a' })).toBeUndefined()
    // A lone call after reply text is no group.
    expect((await ui.find({ key: 't0.d' }))?.text).toContain('Edit c.ts')

    await ui.press({ key: 't0.ga' })
    expect((await ui.find({ key: 't0.a' }))?.text).toContain('a.ts')
    expect((await ui.find({ key: 't0.c' }))?.text).toContain('✗')

    await ui.press({ key: 't0.c' })
    expect(await ui.find({ text: /exit 1/ })).toBeDefined()

    // The thread is the only one and open: collapse all resets the state for the next surface.
    await ui.press({ key: 'toggle-all' })

    await ui.unmount()
  }
})
