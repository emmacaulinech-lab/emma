import { buildMorning, buildEvening } from './day-planning.js'

const labels = {
  admin: 'Mails et formations',
  sport: 'Sport',
  preparation: 'Douche, soins et maquillage',
  outbound: 'Trajet vers le salon',
  return: 'Retour à la maison',
  dinner: 'Dîner',
  kitchen: 'Rangement de la cuisine',
  'evening-routine': 'Douche, soins et hydratation',
}

function minutes(value) {
  if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value || '')) return null
  const [hours, minutes] = value.split(':').map(Number)
  return hours * 60 + minutes
}

function clock(value) {
  const time = ((value % 1440) + 1440) % 1440
  const hours = String(Math.floor(time / 60)).padStart(2, '0')
  const minutes = String(time % 60).padStart(2, '0')
  return hours + ':' + minutes + (value >= 1440 ? ' (+1 j)' : value < 0 ? ' (veille)' : '')
}

export function readDayAppointments(planning) {
  const clients = []
  const personal = []
  for (const block of planning) {
    const start = minutes(block.heureDebut)
    const end = minutes(block.heureFin)
    if (start == null || end == null || end <= start) continue
    const appointment = { start, end, title: block.customNom || block.nom || 'Rendez-vous' }
    if (block.source === 'planity' || block.typeElement === 'planity') clients.push(appointment)
    else if (block.rendezVous || ['rdv', 'rendezVous', 'evenement'].includes(block.categorie) ||
      (block.iconOverride === '📌' && block.aClasser)) personal.push(appointment)
  }
  clients.sort((a, b) => a.start - b.start)
  return { clients, personal }
}

function add(parent, tag, value) {
  const node = document.createElement(tag)
  node.textContent = value
  parent.append(node)
  return node
}

export function renderDayPlanningHome(container, { planning, tomorrowPlanning, today, uid }) {
  const key = 'emma:day-planning:' + uid + ':' + today
  let choices = {}
  try {
    choices = JSON.parse(localStorage.getItem(key)) || {}
  } catch {
    // The preview remains available if storage is disabled.
  }

  function change(patch) {
    choices = { ...choices, ...patch }
    try {
      localStorage.setItem(key, JSON.stringify(choices))
    } catch {
      // Keep the new choice in memory for this render.
    }
    render()
  }

  function render() {
    const day = readDayAppointments(planning)
    const tomorrow = readDayAppointments(tomorrowPlanning)
    const morning = buildMorning({ firstAppointmentStart: day.clients[0]?.start, actualWake: choices.actualWake })
    const nextMorning = buildMorning({ firstAppointmentStart: tomorrow.clients[0]?.start })
    const evening = buildEvening({
      lastAppointmentEnd: day.clients.length ? Math.max(...day.clients.map(client => client.end)) : undefined,
      nextWake: nextMorning.wake,
      personalAppointments: day.personal,
      dinnerChoice: choices.dinnerChoice,
    })
    container.replaceChildren()
    add(container, 'h3', 'Ma journée')
    add(container, 'p', 'Réveil conseillé ' + clock(morning.wake) + ' · Coucher conseillé ' + clock(evening.bedtime))
    const wakeButton = add(container, 'button', choices.actualWake == null ? 'Je suis réveillée' : 'Réveil noté à ' + clock(choices.actualWake))
    wakeButton.type = 'button'
    wakeButton.disabled = choices.actualWake != null
    wakeButton.onclick = () => {
      const now = new Date()
      change({ actualWake: now.getHours() * 60 + now.getMinutes() })
    }
    if (morning.earlyWindow) {
      add(container, 'p', 'Créneau libre de ' + clock(morning.earlyWindow.start) + ' à ' + clock(morning.earlyWindow.end))
    }
    if (evening.needsDinnerChoice || choices.dinnerChoice) {
      add(container, 'p', 'Tu manges où ce soir ?')
      for (const [value, label] of [['outside', 'À l’extérieur'], ['home', 'À la maison']]) {
        const button = add(container, 'button', label)
        button.type = 'button'
        button.setAttribute('aria-pressed', String(choices.dinnerChoice === value))
        button.onclick = () => change({ dinnerChoice: value })
      }
    }
    if (evening.conflictsWithBedtime) {
      add(container, 'p', 'Ta soirée empiète sur le coucher conseillé.')
    }
    const list = add(container, 'ul', '')
    const blocks = [...morning.blocks, ...day.clients, ...day.personal, ...evening.blocks]
    blocks.sort((a, b) => a.start - b.start)
    for (const block of blocks) {
      add(list, 'li', clock(block.start) + '–' + clock(block.end) + ' · ' + (block.title || labels[block.type]))
    }
  }

  render()
}
