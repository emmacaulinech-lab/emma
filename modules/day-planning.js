// Planning times are minutes relative to midnight. Negative values place the
// evening routine on the previous calendar day.
export function buildMorning({ firstAppointmentStart, actualWake } = {}) {
  const works = firstAppointmentStart != null
  const departure = works ? firstAppointmentStart - 30 : null
  const wake = works ? departure - 70 : 9 * 60
  const start = actualWake != null && actualWake < wake ? actualWake : wake
  const blocks = [
    { type: 'admin', start, end: start + 20 },
    { type: 'sport', start: start + 20, end: start + 40 },
    { type: 'preparation', start: start + 40, end: start + 70 },
  ]
  if (works) blocks.push({ type: 'outbound', start: departure, end: firstAppointmentStart })
  return {
    wake,
    departure,
    blocks,
    earlyWindow: start < wake ? { start: start + 70, end: wake + 70 } : null,
  }
}

export function buildEvening({
  lastAppointmentEnd,
  nextWake,
  personalAppointments = [],
  dinnerChoice,
} = {}) {
  const appointments = [...personalAppointments].sort((a, b) => a.start - b.start)
  let returnTrip = lastAppointmentEnd == null ? null : {
    type: 'return',
    start: lastAppointmentEnd,
    end: lastAppointmentEnd + 30,
  }
  const bedtime = nextWake == null ? null : 24 * 60 + nextWake - 8 * 60
  // An appointment may supply the actual planned arrival at home when a
  // stop after work changes the route. Otherwise use its end as a lower bound.
  let dinnerStart = returnTrip ? returnTrip.end + 60 : 20 * 60 + 30
  let needsDinnerChoice = false
  for (const appointment of appointments) {
    if (appointment.end <= (lastAppointmentEnd ?? 0)) continue
    if (appointment.start < dinnerStart + 20 && appointment.end > dinnerStart) {
      needsDinnerChoice = true
    }
    if (returnTrip && appointment.start < returnTrip.end && appointment.end > returnTrip.start) {
      returnTrip = {
        type: 'return',
        start: appointment.end,
        end: appointment.arrivalHome ?? appointment.end + 30,
      }
    }
    if (appointment.start < dinnerStart + 30) {
      const arrival = appointment.arrivalHome ?? (returnTrip?.start === appointment.end ? returnTrip.end : appointment.end)
      if (arrival > dinnerStart - 60) dinnerStart = arrival + 60
    }
  }
  const blocks = []
  if (returnTrip) blocks.push(returnTrip)
  if (dinnerChoice !== 'outside' && (!needsDinnerChoice || dinnerChoice === 'home')) {
    blocks.push({ type: 'dinner', start: dinnerStart, end: dinnerStart + 20 })
    blocks.push({ type: 'kitchen', start: dinnerStart + 20, end: dinnerStart + 30 })
  }
  if (bedtime != null) blocks.push({ type: 'evening-routine', start: bedtime - 30, end: bedtime })
  const eveningEnd = Math.max(0, ...blocks.filter(block => block.type !== 'evening-routine').map(block => block.end),
    ...appointments.map(appointment => appointment.end))
  const earliestBedtime = bedtime == null ? null : Math.max(bedtime, eveningEnd + 30)
  return {
    bedtime, earliestBedtime,
    needsDinnerChoice: needsDinnerChoice && dinnerChoice == null,
    conflictsWithBedtime: earliestBedtime > bedtime,
    blocks,
  }
}
