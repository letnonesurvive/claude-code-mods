export type Row = {
  name: string
  tokens: number
  color: string
  kind: 'used' | 'free' | 'buffer'
}

export type Limit = { kind: string; percent: number; resetsAt: string | null }

export type Snapshot = {
  rows: Row[]
  total: number
  max: number
  percent: number
  compactsAt: number | null
  limits: Limit[]
}

declare module 'claude-code' {
  interface PluginState {
    'context-bar': { isOn: boolean; snapshot: Snapshot | null }
  }
}
