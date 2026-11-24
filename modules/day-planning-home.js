import { buildMorning, buildEvening } from './day-planning.js?v=26'

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

const roomColors = {
  Cuisine: '#D98B6C',
  Chambre: '#A78BC3',
  Salon: '#C97C91',
  Entrée: '#C5A46D',
  Linge: '#7FA58C',
  'Salle de bain': '#A78BC3',
  Perso: '#668FB5',
}

const blockColors = {
  morning: '#8D78B8',
  admin: '#668FB5',
  sport: '#65A37A',
  preparation: '#C69A72',
  outbound: '#7895A5',
  return: '#7895A5',
  dinner: '#C4A24E',
  kitchen: roomColors.Cuisine,
  'evening-routine': '#C69A72',
}

function tint(node, block) {
  const color = block.color || roomColors[block.room] || blockColors[block.type] || '#993556'
  node.classList.add('day-workspace-block')
  node.style.setProperty('--day-block-color', color)
}

export function readDayAppointments(planning) {
  const clients = []
  const personal = []
  for (const block of planning) {
    const start = minutes(block.heureDebut)
    const end = minutes(block.heureFin)
    if (start == null || end == null || end <= start) continue
    const appointment = { start, end, arrivalHome: minutes(block.arriveeMaison), title: block.customNom || block.nom || 'Rendez-vous' }
    const customColor = block.couleur || block.couleurOverride
    const color = /^#[0-9a-f]{6}$/i.test(customColor || '') ? customColor : null
    if (block.source === 'planity' || block.typeElement === 'planity') {
      clients.push({ ...appointment, color: color || '#E87A9A' })
    }
    else if (block.rendezVous || ['rdv', 'rendezVous', 'evenement'].includes(block.categorie) ||
      (block.iconOverride === '📌' && block.aClasser)) personal.push({ ...appointment, color: color || '#993556' })
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

import { due, firstSlot, homeTasks, suggestHome } from './day-planning-quiz.js'
import { buildCalendar } from './day-planning-calendar.js'

function dateOffset(date, days) {
  const value = new Date(date + 'T12:00:00')
  value.setDate(value.getDate() + days)
  return value.toLocaleDateString('sv-SE')
}

function button(root, label, action) {
  const node = add(root, 'button', label)
  node.type = 'button'
  node.className = 'btn bg bsm'
  node.onclick = action
  return node
}

function input(root, label, type, value = '') {
  const field = add(root, 'label', label + ' ')
  const node = document.createElement('input')
  node.type = type
  node.value = value
  field.append(node)
  return node
}

function interval(block) {
  return clock(block.start) + '–' + clock(block.end)
}

function alreadyDone(journal, pattern) {
  return (journal?.zones || []).flatMap(zone => zone.actions || [])
    .flatMap(action => action.sousTaches || [])
    .filter(task => pattern.test(task.nom || ''))
    .map(task => task.dernierFait || task.derniereFois || task.derniereRealisation || task.derniereExecution || task.lastDone)
    .filter(value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value))
    .sort().at(-1)?.slice(0, 10)
}

export function readPlanningHistory(uid) {
  let state
  try {
    state = JSON.parse(localStorage.getItem('emma:planning-v1:' + uid)) || {}
  } catch {
    return []
  }
  const bookings = (state.bookings || []).filter(item => item.done).map(item => ({
    date: item.completedAt?.slice(0, 10) || item.date,
    time: item.completedAt?.slice(11, 16) || '',
    title: item.title,
    color: roomColors[item.room],
  }))
  const routines = Object.entries(state.days || {}).flatMap(([date, settings]) =>
    Object.entries(settings.checks || {}).filter(([, checked]) => checked).map(([title]) => ({
      date, title, time: settings.checkTimes?.[title] || '',
    })))
  return [...bookings, ...routines].sort((a, b) =>
    b.date.localeCompare(a.date) || b.time.localeCompare(a.time))
}

export function mountPlanningWorkspace(container, bridge) {
  const key = 'emma:planning-v1:' + bridge.uid
  let state
  try {
    state = JSON.parse(localStorage.getItem(key)) || {}
  } catch {
    state = {}
  }
  const today = new Date().toLocaleDateString('sv-SE')
  let date = today
  let quizOpen = false
  let controlsOpen = false
  let quizReady = false
  let viewMode = 'day'
  let freeTimeOpen = false
  const openRoomGroups = new Set()
  const openRoutines = new Set()
  let saving = false
  let proposals = []
  let proposalTaskCount = 0
  let proposalDayCount = 0
  let rankedTasks = []
  let error = ''
  let calendarStatus = ''
  let publishedCalendar = ''
  let publishing = false
  state.days ||= {}
  state.bookings ||= []
  state.pending ||= {}
  state.completed ||= {}
  state.laundry ||= 0

  function save() {
    try {
      localStorage.setItem(key, JSON.stringify(state))
      error = ''
    } catch {
      error = 'Le stockage de l’appareil est indisponible. Les changements restent visibles dans cet écran.'
    }
  }

  function dayState(day) {
    return state.days[day] ||= {}
  }

  function getDay(day) {
    const { clients, personal } = readDayAppointments(bridge.planning(day))
    const settings = dayState(day)
    const first = clients[0]?.start ?? settings.workStart
    const last = clients.length ? Math.max(...clients.map(client => client.end)) : settings.workEnd
    const morning = buildMorning({ firstAppointmentStart: first, actualWake: settings.actualWake })
    return { clients, personal, first, last, morning, settings }
  }

  function getSchedule(day) {
    const data = getDay(day)
    const evening = buildEvening({
      lastAppointmentEnd: data.last,
      nextWake: getDay(dateOffset(day, 1)).morning.wake,
      personalAppointments: data.personal,
      dinnerChoice: data.settings.dinnerChoice,
    })
    const robots = [
      { start: 1305, end: 1307, title: 'Roborock · Cuisine', type: 'robot', color: roomColors.Cuisine },
      { start: 1307, end: 1309, title: 'Roborock · Salon', type: 'robot', color: roomColors.Salon },
    ]
    const blockers = [...data.morning.blocks, ...data.clients, ...data.personal, ...evening.blocks]
    const overlaps = item => blockers.some(block => item.start < block.end && item.end > block.start)
    const allBookings = state.bookings.filter(item => item.date === day)
    const displaced = allBookings.filter(item => !item.done && overlaps(item))
    const bookings = allBookings.filter(item => !displaced.includes(item))
    return { ...data, evening, robots, bookings, displaced }
  }

  function notYetDone(item) {
    const now = new Date()
    return item.date > today || (item.date === today && item.end > now.getHours() * 60 + now.getMinutes())
  }

  function available(day, schedule) {
    const { morning, evening, personal, bookings, robots, first } = schedule
    const end = Math.min(evening.bedtime - 30, 1440)
    const occupied = [...morning.blocks, ...evening.blocks, ...personal, ...bookings, ...robots]
    if (first != null) {
      const back = evening.blocks.find(block => block.type === 'return')
      occupied.push({ start: morning.departure, end: back?.end ?? Math.max(first, 19 * 60 + 30) })
    }
    const now = new Date()
    const start = day === today ? Math.max(morning.blocks[2].end, now.getHours() * 60 + now.getMinutes()) : morning.blocks[2].end
    return { date: day, start, end, occupied, works: first != null }
  }

  function taskFor(id) {
    const task = homeTasks.find(task => task.id === id)
    if (id === 'linge') {
      return { ...task, title: ['Lancer une machine', 'Étendre le linge', 'Plier le linge', 'Ranger le linge'][state.laundry % 4] }
    }
    if (id === 'vasque' && state.pending.vasque === 'traces') {
      return { ...task, title: 'Ranger et nettoyer le dessus de la vasque', duration: 10 }
    }
    return task
  }

  function recurringSuggestions(day) {
    return homeTasks.filter(task => {
      const legacy = task.id === 'draps' ? /Changer draps/ : task.id === 'vasque' ? /Ranger la vasque/ : task.id === 'douche' ? /Nettoyer la douche complète/ : null
      const last = state.completed[task.id] || (legacy && alreadyDone(bridge.journal(), legacy))
      const deferred = state.days[day]?.skip?.includes(task.id)
      return !deferred && due(task, last, day)
    })
  }

  function makeProposals() {
    for (const item of state.bookings) {
      if (!item.done && (!notYetDone(item) || getSchedule(item.date).displaced.includes(item)) &&
          homeTasks.some(task => task.id === item.id)) state.pending[item.id] ||= true
    }
    const tasks = Object.keys(state.pending).map(taskFor).filter(Boolean)
      .filter(task => !state.bookings.some(item => item.id === task.id && !item.done && notYetDone(item) && !getSchedule(item.date).displaced.includes(item)))
    const priority = id => (rankedTasks.indexOf(id) + 1 || Number.MAX_SAFE_INTEGER)
    tasks.sort((a, b) => priority(a.id) - priority(b.id))
    const anchor = state.quizStart || today
    const firstDay = anchor < today ? today : anchor
    const days = Array.from({ length: 7 }, (_, index) => dateOffset(firstDay, index))
      .filter(day => getDay(day).first != null || dayState(day).off)
      .map(day => available(day, getSchedule(day)))
    proposalTaskCount = tasks.length
    proposalDayCount = days.length
    proposals = suggestHome(tasks, days)
  }

  function book(task) {
    state.bookings = state.bookings.filter(item => item.done || item.id !== task.id || (notYetDone(item) && !getSchedule(item.date).displaced.includes(item)))
    state.bookings.push({ ...task, done: false })
    save()
    makeProposals()
    render()
  }

  function renderQuiz(root) {
    const wrap = add(root, 'section', '')
    add(wrap, 'h4', 'Préparer ma journée')
    if (Array.from({ length: 7 }, (_, index) => dateOffset(date, index)).some(day => !getDay(day).clients.length && !dayState(day).off && dayState(day).workStart == null)) {
      add(wrap, 'p', 'EMMA cherche des créneaux uniquement les jours où elle connaît tes horaires ou que tu as confirmés comme jours off.')
      for (const [offset, label] of [[0, 'Jour sélectionné : repos'], [1, 'Lendemain : repos']]) {
        const day = dateOffset(date, offset)
        if (day < today || getDay(day).first != null || dayState(day).off) continue
        button(wrap, label, () => {
          dayState(day).off = true
          save()
          if (quizReady) makeProposals()
          render()
        })
      }
      button(wrap, 'Importer Planity', () => bridge.importPlanity(date))
    }
    const signals = new Map()
    for (const task of recurringSuggestions(date).slice(0, 3)) {
      const label = add(wrap, 'label', task.title + ' ')
      const select = document.createElement('select')
      const options = task.id === 'vasque' ? [['', 'Choisir'], ['yes', 'Encombré'], ['traces', 'Encombré avec des traces'], ['no', 'En ordre']] :
        [['', 'Choisir'], ['yes', 'À faire'], ['no', 'Ça peut attendre']]
      for (const [value, name] of options) add(select, 'option', name).value = value
      if (typeof state.pending[task.id] === 'string') select.value = state.pending[task.id]
      label.append(select)
      signals.set(task.id, select)
    }
    const details = add(wrap, 'details', '')
    add(details, 'summary', 'Tu as remarqué autre chose ?')
    const checks = []
    for (const task of homeTasks.filter(task => !signals.has(task.id))) {
      checks.push([task, input(details, task.room + ' · ' + taskFor(task.id).title, 'checkbox')])
    }
    add(wrap, 'p', 'Indique ce qui est à faire, puis choisis un créneau proposé.')
    const view = button(wrap, 'Voir les créneaux', async () => {
      view.disabled = true
      for (const [id, select] of signals) {
        if (select.value === 'no') {
          delete state.pending[id]
          const settings = dayState(date)
          settings.skip = [...new Set([...(settings.skip || []), id])]
        } else if (select.value) state.pending[id] = select.value
      }
      for (const [task, checkbox] of checks) if (checkbox.checked) state.pending[task.id] = true
      quizReady = true
      state.quizStart = date
      save()
      const selectedDay = date
      makeProposals()
      render()
      if (bridge.prioritize && Object.keys(state.pending).length > 1) {
        try {
          const order = await bridge.prioritize(Object.keys(state.pending).map(taskFor).filter(Boolean)
            .map(task => ({ id: task.id, name: task.title, lastDone: state.completed[task.id] || null })))
          if (date === selectedDay && quizOpen && quizReady && order.length) {
            rankedTasks = order
            makeProposals()
            render()
          }
        } catch {
          // Local scheduling already supplied usable proposals.
        }
      }
    })
    if (!quizReady) return
    if (!proposalTaskCount) add(wrap, 'p', 'Aucune tâche à placer. Choisis « À faire » ou coche une tâche dans « Tu as remarqué autre chose ? ».')
    else if (!proposalDayCount) add(wrap, 'p', 'Tes tâches sont retenues. Confirme au moins un jour off ou importe Planity pour voir les créneaux.')
    else if (proposals.length === 0) add(wrap, 'p', 'Les jours renseignés n’ont plus assez de temps libre. Tes tâches seront reproposées.')

    for (const item of proposals) {
      const detail = add(wrap, 'details', '')
      tint(detail, item)
      add(detail, 'summary', item.date + ' · ' + interval(item) + ' · ' + item.room)
      add(detail, 'p', item.title + (item.detail ? ' · ' + item.detail : ''))
      button(detail, 'Ajouter au planning', () => book(item))
    }
  }

  function renderAppointmentForm(root) {
    const form = add(root, 'details', '')
    add(form, 'summary', 'Ajouter un rendez-vous perso')
    const title = input(form, 'Intitulé', 'text')
    const start = input(form, 'Début', 'time')
    const end = input(form, 'Fin', 'time')
    const arrival = input(form, 'Heure de retour à la maison si tu rentres après ce rendez-vous', 'time')
    const status = add(form, 'p', '')
    const submit = button(form, 'Enregistrer', async () => {
      if (saving) return
      if (!title.value.trim() || minutes(start.value) == null || minutes(end.value) == null ||
          end.value <= start.value || (arrival.value && arrival.value < end.value)) {
        status.textContent = 'Vérifie l’intitulé et les horaires.'
        return
      }
      const selected = date
      saving = true
      submit.disabled = true
      try {
        await bridge.addAppointment(selected, {
          customNom: title.value.trim(), heureDebut: start.value, heureFin: end.value,
          arriveeMaison: arrival.value || null,
          duree: minutes(end.value) - minutes(start.value),
        })
        if (quizReady) makeProposals()
        render()
      } catch (failure) {
        status.textContent = failure.message || 'Le rendez-vous n’a pas pu être enregistré. Réessaie.'
      } finally {
        saving = false
        submit.disabled = false
      }
    })
  }

  function calendarText(start, count, stamp = new Date()) {
    const events = []
    for (let i = 0; i < count; i++) {
      const day = dateOffset(start, i)
      const { morning, evening, first, last, personal, bookings } = getSchedule(day)
      const blocks = [
        { start: morning.blocks[0].start, end: morning.blocks[2].end, title: 'Routine du matin' },
        ...morning.blocks.filter(item => item.type === 'outbound').map(item => ({ ...item, title: 'Trajet vers le salon' })),
        ...(first != null && last > first ? [{ start: first, end: last, title: 'Travail' }] : []),
        ...evening.blocks.filter(item => ['return', 'evening-routine', 'dinner'].includes(item.type)).map(item => ({ ...item, title: labels[item.type] })),
        ...personal,
        ...bookings.map(item => ({ ...item, title: item.room === 'Perso' ? item.title : 'Maison · ' + item.room })),
      ]
      blocks.forEach((block, index) => events.push({
        ...block, date: day, id: [bridge.uid, day, block.start, block.type || block.title, index].join('-'),
      }))
      bridge.formations(day).forEach(formation => events.push({
        date: day, id: [bridge.uid, day, formation.title].join('-'),
        title: formation.title + ' · ' + formation.count + ' inscrite' + (formation.count === 1 ? '' : 's'), allDay: true,
      }))
    }
    return buildCalendar(events, stamp)
  }

  function exportCalendar() {
    const url = URL.createObjectURL(new Blob([calendarText(date, 7)], { type: 'text/calendar;charset=utf-8' }))
    const link = document.createElement('a')
    link.href = url
    link.download = 'EMMA-' + date + '.ics'
    link.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  async function publishCalendar(key = state.calendarKey) {
    if (!key || publishing || !bridge.publishCalendar) return false
    const content = calendarText(today, 14, new Date(today + 'T00:00:00Z'))
    if (publishedCalendar === content && state.calendarKey === key) return true
    publishing = true
    try {
      await bridge.publishCalendar({ key, calendar: content })
      publishedCalendar = content
      return true
    } catch {
      calendarStatus = 'Abonnement indisponible. Tu peux utiliser l’export .ics.'
      return false
    } finally {
      publishing = false
    }
  }

  function renderCalendar(root) {
    const group = add(root, 'details', '')
    add(group, 'summary', 'Calendrier Apple')
    add(group, 'p', 'L’export contient les 7 jours à partir de la date sélectionnée. Le fichier .ics est une copie du planning à importer dans Calendrier.')
    button(group, 'Télécharger le planning (.ics)', exportCalendar)
    if (!state.calendarKey) {
      button(group, 'Créer un lien d’abonnement', async () => {
        const key = Array.from(crypto.getRandomValues(new Uint8Array(32)), n => n.toString(16).padStart(2, '0')).join('')
        if (await publishCalendar(key)) {
          state.calendarKey = key
          save()
          calendarStatus = ''
        }
        render()
        container.querySelector('[data-calendar-link]')?.closest('details')?.setAttribute('open', '')
      })
    } else {
      add(group, 'p', 'Ce lien donne accès à ton planning. Garde-le pour toi.')
      const link = add(group, 'a', 'S’abonner dans Calendrier Apple')
      link.dataset.calendarLink = ''
      link.href = bridge.calendarLink(state.calendarKey)
      button(group, 'Désactiver le lien', async () => {
        if (publishing) return
        try {
          publishing = true
          await bridge.publishCalendar({ key: state.calendarKey, revoke: true })
          delete state.calendarKey
          publishedCalendar = ''
          save()
          calendarStatus = ''
        } catch {
          calendarStatus = 'Le lien n’a pas pu être désactivé. Réessaie.'
        } finally {
          publishing = false
          render()
        }
      })
    }
    if (calendarStatus) {
      group.open = true
      add(group, 'p', calendarStatus)
    }
  }

  function scheduleBlocks({ morning, evening, clients, personal, robots, bookings }) {
    const blocks = [
      { start: morning.blocks[0].start, end: morning.blocks[2].end, title: 'Routine du matin', type: 'morning', children: morning.blocks.slice(0, 3) },
      ...morning.blocks.slice(3), ...clients, ...personal, ...evening.blocks, ...robots, ...bookings,
    ].sort((a, b) => a.start - b.start)
    const roomOf = item => {
      if (item.room && item.room !== 'Perso') return item.room
      if (item.type === 'kitchen') return 'Cuisine'
      if (item.type === 'robot') return item.title.split(' · ')[1]
      return null
    }
    const tasksByRoom = new Map()
    for (const block of blocks) {
      const room = roomOf(block)
      if (!room) continue
      if (!tasksByRoom.has(room)) tasksByRoom.set(room, [])
      tasksByRoom.get(room).push(block)
    }
    return blocks.flatMap((block, index) => {
      const room = roomOf(block)
      const tasks = tasksByRoom.get(room)
      if (!tasks || tasks.length < 2) return [block]
      if (tasks[0] !== block) return []

      // The card stays at the first visit. Only extend it across consecutive
      // room tasks, so a later visit never covers an intervening appointment.
      let end = block.end
      for (const next of blocks.slice(index + 1)) {
        if (roomOf(next) !== room || next.start > end) break
        end = Math.max(end, next.end)
      }
      return [{
        type: 'room-group', room, title: room, start: block.start, end,
        roomTasks: tasks, done: tasks.every(task => task.done),
      }]
    })
  }

  function renderRoutineTask(root, { day, settings, id, title, duration, sport, addCheck }) {
    const row = add(root, 'div', '')
    row.className = 'day-workspace-routine-task'
    const override = settings.routineOverrides?.[id]
    if (override) {
      if (override.kind === 'replace') addCheck(row, override.title)
      else if (override.kind === 'report') {
        add(row, 'p', title + ' · Reporté au ' +
          new Date(override.date + 'T12:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }) +
          ' à ' + clock(override.start))
      } else add(row, 'p', title + ' · Passé')
      const moved = state.bookings.find(item => item.id === override.bookingId)
      if (!moved?.done && !settings.checks?.[override.title]) {
        button(row, 'Rétablir', () => {
          if (moved) state.bookings = state.bookings.filter(item => item !== moved)
          delete settings.routineOverrides[id]
          save()
          render()
        })
      }
      return
    }

    addCheck(row, title)
    const options = add(row, 'details', '')
    const menu = add(options, 'summary', '⋯')
    menu.className = 'day-workspace-routine-menu'
    menu.setAttribute('aria-label', 'Options pour ' + title + ' : passer, reporter ou remplacer')
    menu.title = 'Passer, reporter ou remplacer'

    const status = add(options, 'p', '')
    status.setAttribute('role', 'status')
    const record = value => {
      if (settings.checks?.[title]) {
        status.textContent = 'Décoche cette étape avant de la modifier.'
        return false
      }
      settings.routineOverrides ||= {}
      settings.routineOverrides[id] = value
      return true
    }
    const update = () => { save(); render() }
    button(options, '× Passer cette étape', () => {
      if (record({ kind: 'skip' })) update()
    })

    const report = add(options, 'details', '')
    add(report, 'summary', 'Reporter')
    const dateField = input(report, 'Jour du report', 'date', day < today ? today : day)
    dateField.min = today
    button(report, 'Trouver un créneau et reporter', () => {
      const destination = dateField.value
      if (!destination || destination < today) {
        status.textContent = 'Choisis aujourd’hui ou une date à venir.'
        return
      }
      const schedule = getSchedule(destination)
      if (schedule.first == null && !schedule.settings.off) {
        status.textContent = 'Renseigne les horaires de ce jour ou confirme un jour de repos dans le planning.'
        return
      }
      const bounds = available(destination, schedule)
      const slot = firstSlot(bounds.occupied, bounds.start, bounds.end, duration)
      if (!slot) {
        status.textContent = 'Aucun créneau libre assez long ce jour-là.'
        return
      }
      const bookingId = 'routine-' + day + '-' + id
      if (!record({kind:'report', date:destination, start:slot.start, bookingId})) return
      state.bookings.push({
        ...slot, id:bookingId, title, date:destination, room:'Perso', done:false,
        routineReport:true, sport: sport || null,
      })
      update()
    })

    const replace = add(options, 'details', '')
    add(replace, 'summary', 'Remplacer')
    const replacement = input(replace, 'Nouvelle tâche', 'text')
    replacement.maxLength = 120
    button(replace, 'Remplacer dans ce créneau', () => {
      const nextTitle = replacement.value.trim()
      if (!nextTitle || nextTitle === title) {
        status.textContent = 'Saisis une autre tâche.'
        return
      }
      if (record({ kind:'replace', title:nextTitle })) update()
    })
  }

  function renderScheduleBlock(parent, block, day, settings, weekly = false, proposed = false, nested = false) {
    const sport = block.children ? bridge.sport(day) : null
    function addRoutineCheck(parent, title) {
      const check = input(parent, title, 'checkbox')
      check.checked = Boolean(settings.checks?.[title])
      check.onchange = () => {
        settings.checks ||= {}
        settings.checks[title] = check.checked
        settings.checkTimes ||= {}
        const now = new Date()
        settings.checkTimes[title] = check.checked && day === today ? clock(now.getHours() * 60 + now.getMinutes()) : ''
        save()
      }
    }
    const detail = add(parent, 'details', '')
    if (nested) detail.open = true
    tint(detail, block)
    const name = (weekly || nested || block.routineReport ? block.title : block.room || block.title) || labels[block.type]
    const title = block.roomTasks ? name + ' · ' + block.roomTasks.length + ' tâches' : name
    const heading = add(detail, 'summary', '')
    if (weekly || nested) {
      const time = block.roomTasks ? 'Dès ' + clock(block.start) : interval(block)
      add(heading, 'small', time + (proposed ? ' · Proposé' : ''))
      add(heading, 'strong', title + (block.done ? ' ✓' : ''))
    } else {
      heading.textContent = title + (block.done ? ' ✓' : '')
    }
    if (block.roomTasks) {
      const key = day + ':' + block.start + ':' + block.room
      detail.open = openRoomGroups.has(key)
      heading.onclick = () => {
        if (!detail.open) openRoomGroups.add(key)
        else openRoomGroups.delete(key)
      }
      const list = add(detail, 'div', '')
      list.className = 'day-workspace-room-tasks'
      for (const task of block.roomTasks) renderScheduleBlock(list, task, day, settings, weekly, false, true)
      return
    }
    if (proposed) {
      if (block.detail) add(detail, 'p', block.detail)
      button(detail, 'Ajouter au planning', () => book(block))
      return
    }
    if (block.children) {
      detail.open = openRoutines.has(day)
      heading.onclick = () => {
        if (detail.open) openRoutines.delete(day)
        else openRoutines.add(day)
      }
      for (const child of block.children) {
        const row = add(detail, 'div', '')
        add(row, 'small', interval(child))
        const tasks = child.type === 'admin' ? ['Mails', 'Formations'] :
          child.type === 'sport' ? ['Séance de sport · ' + sport.label] :
          ['Douche du matin', 'Soins du matin', 'Maquillage']
        for (const [index, task] of tasks.entries()) {
          const duration = Math.floor((child.end - child.start) * (index + 1) / tasks.length) -
            Math.floor((child.end - child.start) * index / tasks.length)
          renderRoutineTask(row, {day, settings, id:child.type + ':' + index, title:task,
            duration, sport:child.type === 'sport' ? sport : null, addCheck:addRoutineCheck})
        }
      }
      if (day === today && !settings.routineOverrides?.['sport:0']) {
        button(detail, 'Ouvrir la séance de sport', () => bridge.openSport(sport))
      }
    } else if (block.room) {
      if (block.sport && day === today && !block.done) button(detail, 'Ouvrir la séance de sport', () => bridge.openSport(block.sport))
      if ((!weekly && !nested) || block.detail) add(detail, 'p', weekly || nested ? block.detail : block.title + (block.detail ? ' · ' + block.detail : ''))
      if (!block.done) button(detail, 'Fait', () => {
        block.done = true
        const now = new Date()
        block.completedAt = now.toLocaleDateString('sv-SE') + 'T' + clock(now.getHours() * 60 + now.getMinutes())
        state.completed[block.id] = today
        delete state.pending[block.id]
        if (block.id === 'linge') state.laundry = (state.laundry + 1) % 4
        save()
        if (quizReady) makeProposals()
        render()
      })
    } else if (['kitchen', 'evening-routine', 'robot'].includes(block.type)) {
      const options = block.type === 'kitchen' ? ['Faire la vaisselle ou lancer le lave-vaisselle', 'Nettoyer la planche si utilisée', 'Essuyer le plan de travail'] :
        block.type === 'evening-routine' ? ['Douche', 'Soins', 'Hydratation'] : [block.title]
      for (const text of options) addRoutineCheck(detail, text)
    }
  }

  function renderDayTimeline(parent, schedule, day, settings) {
    const start = 7 * 60
    const end = 24 * 60
    const minuteHeight = 1.1
    const minHeight = 29
    const timeline = add(parent, 'div', '')
    timeline.className = 'day-workspace-timeline'
    const outside = (items, label) => {
      if (!items.length) return
      const section = add(timeline, 'section', '')
      section.className = 'day-workspace-outside-hours'
      add(section, 'small', label)
      for (const item of items) {
        add(section, 'small', interval(item))
        renderScheduleBlock(section, item, day, settings)
      }
    }
    outside(schedule.filter(item => item.end <= start), 'Avant 7 h')
    const grid = add(timeline, 'div', '')
    grid.className = 'day-workspace-day-grid'
    const height = (end - start) * minuteHeight
    grid.style.minHeight = height + 'px'
    for (let hour = 7; hour <= 24; hour++) {
      const mark = add(grid, 'div', '')
      mark.className = 'day-workspace-hour-mark'
      mark.style.top = ((hour * 60 - start) * minuteHeight) + 'px'
      add(mark, 'span', hour === 24 ? '00 h' : String(hour).padStart(2, '0') + ' h')
    }
    for (const group of schedule.filter(item => item.roomTasks)) {
      for (const task of group.roomTasks) {
        if (task.end <= group.end || task.end <= start || task.start >= end) continue
        const marker = add(grid, 'span', '')
        marker.className = 'day-workspace-room-marker'
        marker.title = group.room + ' · ' + task.title + ' · ' + interval(task)
        marker.style.top = ((Math.max(start, task.start) - start) * minuteHeight) + 'px'
        marker.style.height = Math.max(5, (Math.min(end, task.end) - Math.max(start, task.start)) * minuteHeight) + 'px'
        marker.style.backgroundColor = task.color || roomColors[group.room] || '#993556'
      }
    }
    const track = add(grid, 'div', '')
    track.className = 'day-workspace-day-track'
    const gap = 4
    let cursor = 0
    for (const block of schedule.filter(item => item.start < end && item.end > start)) {
      const top = (Math.max(start, block.start) - start) * minuteHeight
      const slotHeight = Math.max(minHeight, (Math.min(end, block.end) - Math.max(start, block.start)) * minuteHeight)
      const spacing = Math.max(cursor ? gap : 0, top - cursor)
      const row = add(track, 'div', '')
      row.className = 'day-workspace-positioned'
      row.style.marginTop = spacing + 'px'
      row.style.setProperty('--day-slot-height', slotHeight + 'px')
      cursor += spacing + slotHeight
      renderScheduleBlock(row, block, day, settings)
      const heading = row.querySelector('summary')
      const time = block.roomTasks ? 'Dès ' + clock(block.start) : interval(block)
      heading.title = time
      heading.setAttribute('aria-label', heading.textContent + ', ' + time)
    }
    outside(schedule.filter(item => item.start >= end), 'Après minuit')
  }

  function nextHomeSlot(duration) {
    const now = new Date()
    const minute = now.getHours() * 60 + now.getMinutes()
    const bounds = available(today, getSchedule(today))
    return firstSlot(bounds.occupied, minute, bounds.end, duration)
  }

  function renderFreeTime(root) {
    const panel = add(root, 'section', '')
    panel.className = 'day-workspace-free-time'
    add(panel, 'h3', 'Idées pour aujourd’hui')
    const quickTasks = ['surfaces-cuisine', 'chambre', 'entree', 'retouches', 'surfaces-salon']
    const dueIds = new Set(recurringSuggestions(today).map(task => task.id))
    const choices = [...new Set([...Object.keys(state.pending), ...dueIds, ...quickTasks])]
      .map(taskFor).filter(task => task && state.completed[task.id] !== today &&
        !dayState(today).skip?.includes(task.id) &&
        !state.bookings.some(booking => booking.id === task.id && !booking.done && notYetDone(booking)))
      .map(task => ({ task, slot: nextHomeSlot(task.duration) }))
      .filter(candidate => candidate.slot)
      .slice(0, 3)

    if (!choices.length) add(panel, 'p', 'Aucune tâche proposée ne tient dans les créneaux libres restants aujourd’hui.')
    for (const { task, slot } of choices) {
      const row = add(panel, 'div', '')
      row.className = 'day-workspace-free-task'
      tint(row, task)
      add(row, 'strong', task.room + ' · ' + task.title)
      add(row, 'small', interval(slot) + ' · ' + task.duration + ' min' +
        (state.pending[task.id] || dueIds.has(task.id) ? '' : ' · Si besoin'))
      button(row, 'Ajouter au planning', () => {
        const current = nextHomeSlot(task.duration)
        if (!current || current.start !== slot.start) { render(); return }
        book({ ...task, date: today, ...slot })
      })
    }
  }

  function renderWeek(scrollLeft) {
    makeProposals()
    const selected = new Date(date + 'T12:00:00')
    const monday = dateOffset(date, -((selected.getDay() + 6) % 7))
    const shortDate = day => new Date(day + 'T12:00:00').toLocaleDateString('fr-FR', {
      weekday: 'short', day: 'numeric', month: 'short',
    })
    const header = add(container, 'div', '')
    header.className = 'day-workspace-actions'
    button(header, 'Semaine précédente', () => { date = dateOffset(date, -7); render() })
    add(header, 'strong', shortDate(monday) + ' – ' + shortDate(dateOffset(monday, 6)))
    button(header, 'Semaine suivante', () => { date = dateOffset(date, 7); render() })

    const grid = add(container, 'div', '')
    grid.className = 'day-workspace-week'
    grid.setAttribute('aria-label', 'Planning de la semaine')
    grid.tabIndex = 0
    for (let index = 0; index < 7; index++) {
      const day = dateOffset(monday, index)
      const schedule = getSchedule(day)
      const { clients, displaced, first, settings } = schedule
      const column = add(grid, 'section', '')
      column.className = 'day-workspace-week-day'
      if (day === today) column.dataset.today = ''
      const heading = button(column, shortDate(day), () => { date = day; viewMode = 'day'; quizReady = false; render() })
      if (day === today) heading.setAttribute('aria-current', 'date')
      const candidates = proposals.filter(item => item.date === day)
      if (clients.length) add(column, 'small', clients.length + ' RDV Planity')
      else if (settings.off) add(column, 'small', 'Repos')
      else if (first == null && day >= today) {
        add(column, 'small', 'Journée à renseigner')
        button(column, 'Confirmer repos', () => { settings.off = true; save(); render() })
      }
      const items = [
        ...scheduleBlocks(schedule).map(item => ({ item, proposed: false })),
        ...candidates.map(item => ({ item, proposed: true })),
      ].sort((a, b) => a.item.start - b.item.start)
      for (const { item, proposed } of items) renderScheduleBlock(column, item, day, settings, true, proposed)
      if (displaced.length) add(column, 'small', displaced.length + ' bloc(s) à replacer')
    }
    grid.scrollLeft = scrollLeft
  }

  function render() {
    const { morning, evening, clients, personal, robots, bookings, displaced, settings } = getSchedule(date)
    const scrollLeft = container.querySelector('.day-workspace-week')?.scrollLeft || 0
    container.replaceChildren()
    container.classList.add('day-workspace')
    container.classList.toggle('day-workspace-week-mode', viewMode === 'week')
    const navigation = add(container, 'div', '')
    navigation.className = 'day-workspace-actions'
    for (const [mode, label] of [['day', 'Jour'], ['week', 'Semaine']]) {
      const toggle = button(navigation, label, () => { viewMode = mode; render() })
      toggle.setAttribute('aria-pressed', String(viewMode === mode))
    }
    if (viewMode === 'week') {
      renderWeek(scrollLeft)
      if (state.calendarKey) void publishCalendar()
      return
    }
    const picker = input(navigation, 'Date', 'date', date)
    picker.onchange = () => { if (picker.value) { date = picker.value; quizReady = false; render() } }
    button(navigation, 'Aujourd’hui', () => { date = today; quizReady = false; render() })
    const controls = document.createElement('details')
    controls.className = 'day-workspace-controls'
    controls.open = controlsOpen
    controls.ontoggle = () => { if (controls.isConnected) controlsOpen = controls.open }
    add(controls, 'summary', 'Options du planning')
    button(controls, 'Importer Planity', () => bridge.importPlanity(date))
    renderCalendar(controls)
    if (!clients.length) {
      const dayType = add(controls, 'details', '')
      add(dayType, 'summary', settings.off ? 'Jour off confirmé' : settings.workStart != null ? 'Jour travaillé confirmé' : 'Confirmer le type de journée')
      button(dayType, 'Jour off', () => { settings.off = true; delete settings.workStart; delete settings.workEnd; save(); render() })
      const start = input(dayType, 'Début au salon', 'time', settings.workStart == null ? '09:00' : clock(settings.workStart))
      const end = input(dayType, 'Fin au salon', 'time', settings.workEnd == null ? '19:00' : clock(settings.workEnd))
      button(dayType, 'Jour travaillé', () => {
        if (minutes(start.value) == null || minutes(end.value) == null || end.value <= start.value) return
        settings.off = false
        settings.workStart = minutes(start.value)
        settings.workEnd = minutes(end.value)
        save()
        render()
      })
    }
    add(controls, 'p', 'Réveil conseillé ' + clock(morning.wake) + ' · Coucher conseillé ' + clock(evening.bedtime))
    if (date === today) {
      const wake = button(navigation, settings.actualWake == null ? 'Je suis réveillée' : 'Réveil noté à ' + clock(settings.actualWake), () => {
        const now = new Date()
        settings.actualWake = now.getHours() * 60 + now.getMinutes()
        save()
        render()
      })
      wake.disabled = settings.actualWake != null
    }
    const notices = document.createElement('div')
    if (morning.earlyWindow) {
      const task = taskFor(state.pending['lave-vaisselle'] ? 'lave-vaisselle' : 'linge')
      const slot = firstSlot([...personal, ...bookings], morning.earlyWindow.start, morning.earlyWindow.end, task.duration)
      if (slot && settings.earlyDismissed !== true && !bookings.some(item => item.id === task.id && !item.done)) {
        add(notices, 'p', interval(slot) + ' · ' + task.title)
        button(notices, 'Ajouter au planning', () => book({ ...task, ...slot, date }))
        button(notices, 'Garder le créneau libre', () => { settings.earlyDismissed = true; save(); render() })
      }
    }
    for (let index = 1; index < clients.length; index++) {
      const previous = clients[index - 1]
      const next = clients[index]
      const now = new Date()
      const earliest = date === today ? now.getHours() * 60 + now.getMinutes() : previous.end
      if (date < today || next.start - previous.end > 30) continue
      const slot = firstSlot([...personal, ...bookings, ...clients], Math.max(previous.end, earliest), next.start - 5, 10)
      if (!slot || settings.dismissedBreaks?.includes(next.start)) continue
      const task = { id: 'admin-break-' + next.start, room: 'Perso', title: 'Traiter un message ou envoyer un document', duration: 10, ...slot, date }
      const suggestion = add(notices, 'details', '')
      add(suggestion, 'summary', interval(slot) + ' · Suggestion entre deux clientes')
      add(suggestion, 'p', task.title)
      button(suggestion, 'Ajouter au planning', () => book(task))
      button(suggestion, 'Garder le créneau libre', () => {
        settings.dismissedBreaks = [...(settings.dismissedBreaks || []), next.start]
        save()
        render()
      })
      break
    }
    if (evening.needsDinnerChoice || settings.dinnerChoice) {
      add(notices, 'p', 'Tu manges où ce soir ?')
      for (const [value, label] of [['outside', 'À l’extérieur'], ['home', 'À la maison']]) {
        const choice = button(notices, label, () => { settings.dinnerChoice = value; save(); render() })
        choice.setAttribute('aria-pressed', String(settings.dinnerChoice === value))
      }
    }
    if (displaced.length) add(notices, 'p', 'À replacer · ' + displaced.map(item => item.title).join(' · '))
    if (evening.conflictsWithBedtime) {
      add(notices, 'p', 'Ta soirée empiète sur le coucher conseillé. Avec les blocs actuels, tu peux te coucher à ' + clock(evening.earliestBedtime) + '.')
    }
    if (error) add(notices, 'p', error)
    renderAppointmentForm(controls)
    const quizButton = button(navigation, quizOpen ? 'Fermer le quiz Maison' : 'Préparer ma journée', () => {
      quizOpen = !quizOpen
      controlsOpen = quizOpen
      if (quizOpen && quizReady) makeProposals()
      render()
      if (quizOpen) container.querySelector('#emma-day-options')?.scrollIntoView?.({ block: 'nearest' })
    })
    if (!quizOpen) quizButton.dataset.openQuiz = ''
    if (quizOpen) renderQuiz(controls)
    if (date === today) {
      const free = button(navigation, freeTimeOpen ? 'Fermer les suggestions' : 'J’ai du temps', () => {
        freeTimeOpen = !freeTimeOpen
        render()
      })
      free.setAttribute('aria-expanded', String(freeTimeOpen))
      if (freeTimeOpen) renderFreeTime(container)
    }
    const optionsButton = button(navigation, 'Options', () => {
      controls.open = !controls.open
      if (controls.open) controls.scrollIntoView?.({ block: 'nearest' })
    })
    optionsButton.setAttribute('aria-controls', 'emma-day-options')
    controls.id = 'emma-day-options'
    renderDayTimeline(container, scheduleBlocks({ morning, evening, clients, personal, robots, bookings }), date, settings)
    if (notices.childElementCount) container.append(notices)
    container.append(controls)
    if (state.calendarKey) void publishCalendar()
  }

  render()
  return { refresh() { if (quizReady) makeProposals(); render() } }
}
