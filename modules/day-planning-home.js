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
    const appointment = { start, end, arrivalHome: minutes(block.arriveeMaison), title: block.customNom || block.nom || 'Rendez-vous' }
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
  let quizReady = false
  let saving = false
  let proposals = []
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
      { start: 1305, end: 1307, title: 'Roborock · Cuisine', type: 'robot' },
      { start: 1307, end: 1309, title: 'Roborock · Salon', type: 'robot' },
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
    const firstDay = date < today ? today : date
    const days = Array.from({ length: 7 }, (_, index) => dateOffset(firstDay, index))
      .filter(day => getDay(day).first != null || dayState(day).off)
      .map(day => available(day, getSchedule(day)))
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
      add(wrap, 'p', 'Importe Planity ou confirme tes jours off pour mieux placer les blocs cette semaine.')
      button(wrap, 'Importer Planity', () => bridge.importPlanity(date))
    }
    const signals = new Map()
    for (const task of recurringSuggestions(date).slice(0, 3)) {
      const label = add(wrap, 'label', task.title + ' ')
      const select = document.createElement('select')
      const options = task.id === 'vasque' ? [['', 'Choisir'], ['yes', 'Encombré'], ['traces', 'Encombré avec des traces'], ['no', 'En ordre']] :
        [['', 'Choisir'], ['yes', 'À faire'], ['no', 'Ça peut attendre']]
      for (const [value, name] of options) add(select, 'option', name).value = value
      label.append(select)
      signals.set(task.id, select)
    }
    const details = add(wrap, 'details', '')
    add(details, 'summary', 'Tu as remarqué autre chose ?')
    const checks = []
    for (const task of homeTasks.filter(task => !signals.has(task.id))) {
      checks.push([task, input(details, task.room + ' · ' + taskFor(task.id).title, 'checkbox')])
    }
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
    if (proposals.length === 0) add(wrap, 'p', 'Aucun créneau proposé. Les tâches signalées te seront reproposées.')
    for (const item of proposals) {
      const detail = add(wrap, 'details', '')
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
    button(group, 'Exporter 7 jours (.ics)', exportCalendar)
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
      const link = add(group, 'a', 'S’abonner dans Calendrier Apple')
      link.dataset.calendarLink = ''
      link.href = bridge.calendarLink(state.calendarKey)
      button(group, 'Désactiver le lien', async () => {
        if (publishing) return
        try {
          publishing = true
          await bridge.publishCalendar({ revoke: true })
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

  function render() {
    const { morning, evening, clients, personal, robots, bookings, displaced, settings } = getSchedule(date)
    container.replaceChildren()
    container.classList.add('day-workspace')
    const navigation = add(container, 'div', '')
    navigation.className = 'day-workspace-actions'
    const picker = input(navigation, 'Date', 'date', date)
    picker.onchange = () => { if (picker.value) { date = picker.value; quizReady = false; render() } }
    button(navigation, 'Aujourd’hui', () => { date = today; quizReady = false; render() })
    button(navigation, 'Importer Planity', () => bridge.importPlanity(date))
    renderCalendar(container)
    if (!clients.length) {
      const dayType = add(container, 'details', '')
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
    add(container, 'p', 'Réveil conseillé ' + clock(morning.wake) + ' · Coucher conseillé ' + clock(evening.bedtime))
    if (date === today) {
      const wake = button(container, settings.actualWake == null ? 'Je suis réveillée' : 'Réveil noté à ' + clock(settings.actualWake), () => {
        const now = new Date()
        settings.actualWake = now.getHours() * 60 + now.getMinutes()
        save()
        render()
      })
      wake.disabled = settings.actualWake != null
    }
    if (morning.earlyWindow) {
      const task = taskFor(state.pending['lave-vaisselle'] ? 'lave-vaisselle' : 'linge')
      const slot = firstSlot([...personal, ...bookings], morning.earlyWindow.start, morning.earlyWindow.end, task.duration)
      if (slot && settings.earlyDismissed !== true && !bookings.some(item => item.id === task.id && !item.done)) {
        add(container, 'p', interval(slot) + ' · ' + task.title)
        button(container, 'Ajouter au planning', () => book({ ...task, ...slot, date }))
        button(container, 'Garder le créneau libre', () => { settings.earlyDismissed = true; save(); render() })
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
      const suggestion = add(container, 'details', '')
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
      add(container, 'p', 'Tu manges où ce soir ?')
      for (const [value, label] of [['outside', 'À l’extérieur'], ['home', 'À la maison']]) {
        const choice = button(container, label, () => { settings.dinnerChoice = value; save(); render() })
        choice.setAttribute('aria-pressed', String(settings.dinnerChoice === value))
      }
    }
    if (displaced.length) add(container, 'p', 'À replacer · ' + displaced.map(item => item.title).join(' · '))
    if (evening.conflictsWithBedtime) {
      add(container, 'p', 'Ta soirée empiète sur le coucher conseillé. Avec les blocs actuels, tu peux te coucher à ' + clock(evening.earliestBedtime) + '.')
    }
    if (error) add(container, 'p', error)
    renderAppointmentForm(container)
    const quizButton = button(container, quizOpen ? 'Fermer le quiz Maison' : 'Préparer ma journée', () => { quizOpen = !quizOpen; if (quizOpen && quizReady) makeProposals(); render() })
    if (!quizOpen) quizButton.dataset.openQuiz = ''
    if (quizOpen) renderQuiz(container)
    const list = add(container, 'div', '')
    const sport = bridge.sport(date)
    const schedule = [
      { start: morning.blocks[0].start, end: morning.blocks[2].end, title: 'Routine du matin', children: morning.blocks.slice(0, 3) },
      ...morning.blocks.slice(3), ...clients, ...personal, ...evening.blocks, ...robots, ...bookings,
    ]
    for (const block of schedule.sort((a, b) => a.start - b.start)) {
      const detail = add(list, 'details', '')
      add(detail, 'summary', interval(block) + ' · ' + (block.room || block.title || labels[block.type]) + (block.done ? ' ✓' : ''))
      if (block.children) {
        for (const child of block.children) add(detail, 'p', interval(child) + ' · ' + (child.type === 'sport' ? sport.label : labels[child.type]))
        if (date === today) button(detail, 'Ouvrir la séance de sport', () => bridge.openSport(sport))
      } else if (block.room) {
        add(detail, 'p', block.title + (block.detail ? ' · ' + block.detail : ''))
        if (!block.done) button(detail, 'Fait', () => {
          block.done = true
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
        for (const text of options) {
          const check = input(detail, text, 'checkbox')
          check.checked = Boolean(settings.checks?.[text])
          check.onchange = () => {
            settings.checks ||= {}
            settings.checks[text] = check.checked
            save()
          }
        }
      }
    }
    if (state.calendarKey) void publishCalendar()
  }

  render()
  return { refresh: render }
}
