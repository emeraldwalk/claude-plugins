/** Keys of the expanded rows: a thread's `t<index>`, or an item's `t<index>.<id>`. */
export type ExpandedKeys = string[]

declare module 'claude-code' {
  interface PluginState {
    'session-outline': {
      isOpen: boolean
      revision: number
      expanded: ExpandedKeys
    }
  }
}
