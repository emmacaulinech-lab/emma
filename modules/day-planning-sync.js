const fields = ['days', 'pending', 'completed', 'laundry', 'quizStart']
const isRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value)

function snapshot(state) {
  const data = Object.fromEntries(fields.filter(key => state[key] !== undefined).map(key => [key, state[key]]))
  if (!data.laundry) delete data.laundry
  data.bookings = Object.fromEntries((state.bookings || []).map(task =>
    [JSON.stringify([task.date, task.id, task.start]), task]))
  return JSON.parse(JSON.stringify(data))
}

function diff(before, after, path = []) {
  if (isRecord(after) || (after === undefined && isRecord(before))) {
    const previous = isRecord(before) ? before : {}
    const next = after || {}
    return [...new Set([...Object.keys(previous), ...Object.keys(next)])]
      .flatMap(key => diff(previous[key], next[key], [...path, key]))
  }
  if (JSON.stringify(before) === JSON.stringify(after)) return []
  return [after === undefined ? { path } : { path, value: after }]
}

function apply(data, changes, missingOnly = false) {
  for (const { path, value } of changes) {
    if (path.some(key => ['__proto__', 'prototype', 'constructor'].includes(key))) continue
    let target = data
    const parents = []
    for (const key of path.slice(0, -1)) {
      if (!isRecord(target[key])) {
        if (value === undefined) { target = null; break }
        target[key] = {}
      }
      parents.push([target, key])
      target = target[key]
    }
    if (!target) continue
    const key = path.at(-1)
    if (missingOnly && Object.hasOwn(target, key)) continue
    if (value === undefined) {
      delete target[key]
      for (const [parent, field] of parents.reverse()) {
        if (Object.keys(parent[field]).length) break
        delete parent[field]
      }
    } else target[key] = JSON.parse(JSON.stringify(value))
  }
  return data
}

export function connectPlanningSync(state, { exchange, cache, receive, isCurrent, status }) {
  let baseline = snapshot(state)
  let running = false
  let lastRead = 0
  const queue = state.sync ||= { seed: diff({}, baseline), changes: [] }

  async function flush(force = false) {
    if (!isCurrent() || running) return
    if (!force && !queue.seed && !queue.changes.length && Date.now() - lastRead < 15000) return
    running = true
    const count = queue.changes.length
    try {
      const remote = await exchange(data => apply(apply(data, queue.seed || [], true), queue.changes.slice(0, count)))
      lastRead = Date.now()
      if (!isCurrent()) return
      delete queue.seed
      queue.changes.splice(0, count)
      const merged = apply(remote, queue.changes)
      const changed = diff(baseline, merged).length > 0
      if (changed) {
        for (const key of fields) delete state[key]
        Object.assign(state, { days: {}, pending: {}, completed: {}, laundry: 0 },
          Object.fromEntries(fields.filter(key => Object.hasOwn(merged, key)).map(key => [key, merged[key]])), {
          bookings: Object.values(merged.bookings || {}),
        })
        baseline = snapshot(state)
      }
      cache()
      status('')
      if (changed) receive()
    } catch {
      if (isCurrent()) status('Synchronisation du planning indisponible. Tes changements restent sur cet appareil.')
      return
    } finally {
      running = false
    }
    if (queue.changes.length) void flush()
  }

  function save() {
    const next = snapshot(state)
    queue.changes.push(...diff(baseline, next))
    baseline = next
    cache()
    void flush()
  }

  return { save, flush }
}
