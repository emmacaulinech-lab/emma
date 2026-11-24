function escape(value) {
  return String(value).replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n').replace(/[;,]/g, '\\$&')
}

function dateTime(day, minutes) {
  const d = new Date(day + 'T00:00:00')
  d.setDate(d.getDate() + Math.floor(minutes / 1440))
  const t = ((minutes % 1440) + 1440) % 1440
  return d.toLocaleDateString('sv-SE').replaceAll('-', '') + 'T' +
    String(Math.floor(t / 60)).padStart(2, '0') + String(t % 60).padStart(2, '0') + '00'
}

export function buildCalendar(events, generatedAt = new Date()) {
  const stamp = generatedAt.toISOString().replace(/[-:]|\.\d{3}/g, '')
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//EMMA OS//Planning//FR', 'CALSCALE:GREGORIAN']
  for (const event of events) {
    lines.push('BEGIN:VEVENT', 'UID:' + escape(event.id) + '@emma-os', 'DTSTAMP:' + stamp)
    if (event.allDay) {
      lines.push('DTSTART;VALUE=DATE:' + dateTime(event.date, 0).slice(0, 8),
        'DTEND;VALUE=DATE:' + dateTime(event.date, 1440).slice(0, 8))
    } else {
      lines.push('DTSTART:' + dateTime(event.date, event.start), 'DTEND:' + dateTime(event.date, event.end))
    }
    lines.push('SUMMARY:' + escape(event.title))
    if (event.calendarGroup) lines.push('X-EMMA-GROUP:' + escape(event.calendarGroup))
    lines.push('END:VEVENT')
  }
  lines.push('END:VCALENDAR')
  return lines.map(line => {
    const encoder = new TextEncoder()
    let output = '', length = 0
    for (const char of line) {
      const size = encoder.encode(char).length
      if (length + size > 75) {
        output += '\r\n '
        length = 1
      }
      output += char
      length += size
    }
    return output
  }).join('\r\n') + '\r\n'
}
