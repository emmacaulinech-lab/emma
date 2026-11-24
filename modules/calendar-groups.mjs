export const calendarGroups = {
  routines: { title: 'Routines', color: '#8D78B8' },
  trajets: { title: 'Trajets', color: '#7895A5' },
  travail: { title: 'Travail et formations', color: '#E87A9A' },
  perso: { title: 'Perso', color: '#668FB5' },
  repas: { title: 'Dîner', color: '#C4A24E' },
  maison: { title: 'Maison', color: '#993556' },
  cuisine: { title: 'Cuisine', color: '#D98B6C' },
  chambre: { title: 'Chambre', color: '#A78BC3' },
  salon: { title: 'Salon', color: '#C97C91' },
  entree: { title: 'Entrée', color: '#C5A46D' },
  linge: { title: 'Linge', color: '#7FA58C' },
  'salle-de-bain': { title: 'Salle de bain', color: '#A78BC3' },
}

const roomGroups = {
  Cuisine: 'cuisine', Chambre: 'chambre', Salon: 'salon', Entrée: 'entree',
  Linge: 'linge', 'Salle de bain': 'salle-de-bain',
}

export function calendarRoomGroup(room) {
  return Object.hasOwn(roomGroups, room) ? roomGroups[room] : 'maison'
}

export function selectCalendarGroup(calendar, group) {
  const { title, color } = calendarGroups[group]
  const lines = calendar.split('\r\n')
  const output = []
  let event = null
  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') event = []
    if (event) {
      event.push(line)
      if (line === 'END:VEVENT') {
        if (event.includes('X-EMMA-GROUP:' + group)) output.push(...event)
        event = null
      }
      continue
    }
    output.push(line)
    if (line === 'BEGIN:VCALENDAR') {
      output.push('X-WR-CALNAME:EMMA · ' + title, 'X-APPLE-CALENDAR-COLOR:' + color)
    }
  }
  return output.join('\r\n')
}
