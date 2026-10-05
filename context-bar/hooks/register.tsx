import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Limit, Row, Snapshot } from '../types'

const COMMAND = 'context-bar'
const isOn = atom({ plugin: 'context-bar', key: 'isOn' } as const, false)
const snapshot = atom({ plugin: 'context-bar', key: 'snapshot' } as const, null)

const tokens = (n: number): string => {
  if (n >= 1_000_000) {
    return `${+(n / 1_000_000).toFixed(1)}M`
  }

  if (n >= 1000) {
    return `${+(n / 1000).toFixed(n < 10_000 ? 1 : 0)}k`
  }

  return String(n)
}

const share = (n: number, max: number): string => {
  const percent = max > 0 ? (n / max) * 100 : 0

  return `${+percent.toFixed(percent < 1 ? 1 : 0)}%`
}

// Locally estimated breakdown: no token-count requests are sent.
const measure = async ($: EngineInterface): Promise<void> => {
  const { context, rateLimits } = await $.session.usage({ breakdown: 'summary' })
  const breakdown = context.breakdown

  if (!breakdown) {
    return
  }

  const rows: Row[] = []

  for (const one of breakdown.categories) {
    if (one.kind !== 'deferred' && one.tokens > 0) {
      rows.push({
        name: one.name.toLowerCase(),
        tokens: one.tokens,
        color: one.color,
        kind: one.kind,
      })
    }
  }

  const next: Snapshot = {
    rows,
    total: breakdown.totalTokens,
    max: breakdown.rawMaxTokens,
    percent: breakdown.percentage,
    compactsAt: breakdown.isAutoCompactEnabled
      ? (breakdown.autoCompactThreshold ?? null)
      : null,
    limits: rateLimits.map(
      (one): Limit => ({
        kind: one.kind,
        percent: one.percentUsed,
        resetsAt: one.resetsAt ?? null,
      }),
    ),
  }
  await update($, snapshot, () => next)
}

// Splits `width` cells among the rows by tokens; every row keeps one cell.
const cells = (rows: Row[], width: number): number[] => {
  const sum = rows.reduce((all, row) => all + row.tokens, 0) || 1
  const out = rows.map(row => Math.max(1, Math.round((row.tokens / sum) * width)))
  let spare = width - out.reduce((all, n) => all + n, 0)

  while (spare !== 0) {
    const widest = out.indexOf(Math.max(...out))

    const cellsNow = out[widest] ?? 0

    if (spare < 0 && cellsNow <= 1) {
      break
    }

    out[widest] = cellsNow + Math.sign(spare)
    spare -= Math.sign(spare)
  }

  return out
}

const LIMIT_NAMES: Record<string, string> = {
  five_hour: 'session',
  seven_day: 'week',
  spend_limit: 'spend',
}

const until = (resetsAt: string | null, now: number): string => {
  const left = resetsAt === null ? NaN : Date.parse(resetsAt) - now

  if (!(left > 0)) {
    return ''
  }

  const minutes = Math.ceil(left / 60_000)
  const days = Math.floor(minutes / 1440)
  const hours = Math.floor((minutes % 1440) / 60)

  if (days > 0) {
    return ` · resets in ${days}d ${hours}h`
  }

  return ` · resets in ${hours > 0 ? `${hours}h ` : ''}${minutes % 60}m`
}

const tone = (percent: number): string =>
  percent >= 90 ? 'error' : percent >= 70 ? 'warning' : 'success'

const GLYPH = { used: '█', free: '░', buffer: '▒' } as const

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: COMMAND,
      description: 'Toggle the context window bar above the prompt',
    })

    // The choice outlives the session in $.store; $.state is per session.
    if ((await read($, isOn)) || (await $.store.get('isOn')) === true) {
      await update($, isOn, () => true)
      void measure($)
    }

    return next(e)
  })

  on('command.run', { command: COMMAND }, async $ => {
    const shown = !(await read($, isOn))

    if (shown) {
      await measure($)
    }

    await update($, isOn, () => shown)
    await $.store.set('isOn', shown)

    return { text: shown ? 'Context bar shown.' : 'Context bar hidden.' }
  })

  on('session.measure', async ($, e, next) => {
    if (await read($, isOn)) {
      void measure($)
    }

    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const shown = await read($, isOn)
    const snap = await read($, snapshot)

    if (e.props.hasSurvey || !shown || snap === null) {
      return next(e)
    }

    const { Box, Text } = $.ui.resolve(e)
    // Border and padding take four cells of the band.
    const width = Math.max(10, e.props.bodyColumns - 4)
    const widths = cells(snap.rows, width)
    const level = tone(snap.percent)
    const now = await $.clock.now()
    const meter = Math.max(8, Math.min(40, width - 40))

    return (
      <Box flexDirection="column" borderStyle="round" borderDimColor paddingX={1}>
        <Box justifyContent="space-between">
          <Text bold>
            <Text color="claude">◆</Text> context
          </Text>
          <Text>
            <Text bold>{tokens(snap.total)}</Text>
            <Text dimColor>
              {' '}
              of {tokens(snap.max)}
              {snap.compactsAt === null ? '' : ` · compacts at ${tokens(snap.compactsAt)}`}{' '}
            </Text>
            <Text color={level} inverse bold>
              {' '}
              {snap.percent}%{' '}
            </Text>
          </Text>
        </Box>
        <Text wrap="truncate">
          {snap.rows.map((row, i) => (
            <Text color={row.color} dimColor={row.kind === 'free'}>
              {GLYPH[row.kind].repeat(widths[i] ?? 0)}
            </Text>
          ))}
        </Text>
        <Box flexWrap="wrap" columnGap={3}>
          {snap.rows.map(row => (
            <Text>
              <Text color={row.color} dimColor={row.kind === 'free'}>
                {GLYPH[row.kind]}
              </Text>{' '}
              {row.name} <Text bold>{tokens(row.tokens)}</Text>
              {row.kind === 'free' ? '' : <Text dimColor> {share(row.tokens, snap.max)}</Text>}
            </Text>
          ))}
        </Box>
        {(snap.limits ?? []).map(limit => {
          const filled = Math.min(meter, Math.round((limit.percent / 100) * meter))

          return (
            <Text wrap="truncate">
              {(LIMIT_NAMES[limit.kind] ?? limit.kind).padEnd(8)}
              <Text color={tone(limit.percent)}>{'━'.repeat(filled)}</Text>
              <Text dimColor>{'─'.repeat(meter - filled)}</Text>{' '}
              <Text bold>{limit.percent}%</Text>
              <Text dimColor> used{until(limit.resetsAt, now)}</Text>
            </Text>
          )
        })}
      </Box>
    )
  })
}
