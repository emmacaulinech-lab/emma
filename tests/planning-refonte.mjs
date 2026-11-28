import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { JSDOM } from 'jsdom'
import { buildMorning, buildEvening } from '../modules/day-planning.js'
import { due, firstSlot, homeTasks, suggestHome } from '../modules/day-planning-quiz.js'
import { buildCalendar } from '../modules/day-planning-calendar.js'
import { mountPlanningWorkspace, readDayAppointments } from '../modules/day-planning-home.js'
import { completeNutritionQuantities, mountNutritionAdvice, selectSport } from '../modules/day-planning-glow.js'
import { makeCalendarHandler } from '../netlify/functions/calendrier-emma.mjs'

test('routine de 70 minutes, réveil anticipé et coucher à cheval sur minuit', () => {
  const result = buildMorning({ firstAppointmentStart: 540, actualWake: 420 })
  assert.equal(result.wake, 440)
  assert.deepEqual(result.earlyWindow, { start: 490, end: 510 })
  assert.equal(buildEvening({ nextWake: 540 }).bedtime, 1500)
})

test('fin de travail tôt : le dîner reste à 20 h 30, ou plus tard si le retour est tardif', () => {
  const dinner = end => buildEvening({ lastAppointmentEnd: end, nextWake: 540 }).blocks.find(block => block.type === 'dinner')
  assert.equal(dinner(13 * 60 + 30).start, 20 * 60 + 30)
  assert.equal(dinner(20 * 60).start, 21 * 60 + 30)
})

test('rendez-vous pendant le dîner et retour après un rendez-vous', () => {
  const personalAppointments = [{ start: 1220, end: 1270, arrivalHome: 1300 }]
  const options = { lastAppointmentEnd: 1140, nextWake: 440, personalAppointments }
  assert.equal(buildEvening(options).needsDinnerChoice, true)
  assert.ok(!buildEvening({ ...options, dinnerChoice: 'outside' }).blocks.some(block => block.type === 'kitchen'))
  const dinner = buildEvening({ ...options, dinnerChoice: 'home' }).blocks.find(block => block.type === 'dinner')
  assert.deepEqual([dinner.start, dinner.end], [1360, 1380])
})

test('échéances et blocs longs en priorité un jour off', () => {
  const find = id => homeTasks.find(task => task.id === id)
  assert.equal(due(find('draps'), '2026-11-20', '2026-11-23'), true)
  assert.equal(due(find('vasque'), '2026-11-22', '2026-11-23'), false)
  assert.equal(due(find('douche'), '2026-01-31', '2026-02-28'), true)
  assert.deepEqual(firstSlot([{ start: 0, end: 10 }, { start: 20, end: 45 }], 0, 50, 10), {start: 10, end: 20})
  const results = suggestHome([find('douche'), find('four'), find('entree')], [
    { date: '2026-11-23', start: 600, end: 700, works: true, occupied: [] },
    { date: '2026-11-24', start: 600, end: 700, works: false, occupied: [] },
  ])
  assert.equal(results.filter(item => item.date === '2026-11-24').length, 2)
  assert.equal(results.find(item => item.id === 'entree').date, '2026-11-23')
})

test('le quiz ignore les tâches déjà prévues et replace en priorité un créneau manqué', async () => {
  const dom = new JSDOM('<main></main>', { url: 'http://localhost' })
  globalThis.document = dom.window.document
  globalThis.localStorage = dom.window.localStorage
  const localDate = (offset) => {
    const day = new Date()
    day.setDate(day.getDate() + offset)
    return day.toLocaleDateString('sv-SE')
  }
  const today = localDate(0)
  const tomorrow = localDate(1)
  const missed = { ...homeTasks.find(task => task.id === 'canape'), date: today, start: -10, end: 0 }
  const done = { ...homeTasks.find(task => task.id === 'entree'), date: today, start: 780, end: 790, done: true }
  localStorage.setItem('emma:planning-v1:priority-test', JSON.stringify({
    bookings: [missed, done], pending: { 'surfaces-salon': true }, days: { [tomorrow]: { off: true } },
  }))
  const root = document.querySelector('main')
  mountPlanningWorkspace(root, {
    uid: 'priority-test', journal: () => ({}), planning: () => [],
    formations: () => [], sport: () => ({ label: 'Fessiers' }),
  })
  assert.match(root.querySelector('details.day-workspace-done').textContent, /Entrée/)
  const findButton = label => [...root.querySelectorAll('button')].find(node => node.textContent === label)
  findButton('Préparer ma journée').click()
  const quiz = [...root.querySelectorAll('section')].find(node => node.querySelector('h4')?.textContent === 'Préparer ma journée')
  const choices = [...quiz.querySelectorAll('label')].map(label => label.textContent)
  assert.ok(!choices.some(label => /Dépoiler le canapé|Ranger les chaussures/.test(label)))
  await findButton('Voir les créneaux').onclick()
  const proposed = [...root.querySelectorAll('details')].filter(node => node.querySelector('button')?.textContent === 'Ajouter au planning')
  const missedBlock = proposed.find(node => node.textContent.includes('Dépoiler le canapé'))
  const newBlock = proposed.find(node => node.textContent.includes('Ranger ou dépoussiérer les surfaces'))
  assert.match(missedBlock.textContent, new RegExp(tomorrow + ' · 10:10'))
  assert.match(newBlock.textContent, new RegExp(tomorrow + ' · 10:20'))
})

test('les draps faits hier restent absents du quiz et des créneaux avant trois jours', async t => {
  t.mock.timers.enable({ apis: ['Date'], now: new Date(2026, 10, 25, 11) })
  const journal = { zones: [{ actions: [{ sousTaches: [{ nom: 'Changer les draps', dernierFait: '2026-11-24' }] }] }] }
  for (const [saved, history] of [
    [{ completed: { draps: '2026-11-24' } }, {}],
    [{ completed: { draps: '2026-11-15' } }, journal],
    [{ bookings: [{ id: 'draps', date: '2026-11-24', done: true }] }, {}],
  ]) {
    const dom = new JSDOM('<main></main>', { url: 'http://localhost' })
    globalThis.document = dom.window.document
    globalThis.localStorage = dom.window.localStorage
    const offDays = ['2026-11-25', '2026-11-26', '2026-11-27']
    localStorage.setItem('emma:planning-v1:recurring-test', JSON.stringify({
      ...saved, pending: { draps: true }, days: Object.fromEntries(offDays.map(day => [day, { off: true }])),
    }))
    const root = document.querySelector('main')
    mountPlanningWorkspace(root, {
      uid: 'recurring-test', journal: () => history, planning: () => [],
      formations: () => [], sport: () => ({ label: 'Fessiers' }),
    })
    const button = label => [...root.querySelectorAll('button')].find(node => node.textContent === label)
    button('Préparer ma journée').click()
    assert.doesNotMatch(root.textContent, /Changer les draps et les taies/)
    await button('Voir les créneaux').onclick()
    const proposal = [...root.querySelectorAll('details')].find(node =>
      node.querySelector('p')?.textContent === 'Changer les draps et les taies')
    assert.match(proposal.querySelector('summary').textContent, /^2026-11-27/)
  }
})

test('la machine déclenche un bloc de linge après le cycle ou une proposition ultérieure', t => {
  t.mock.timers.enable({ apis: ['Date'], now: new Date(2026, 10, 24, 14) })
  const build = (uid, machineStart, rows = []) => {
    const dom = new JSDOM('<main></main>', { url: 'http://localhost' })
    globalThis.document = dom.window.document
    globalThis.localStorage = dom.window.localStorage
    const key = 'emma:planning-v1:' + uid
    localStorage.setItem(key, JSON.stringify({ bookings: [
      { id: 'linge', room: 'Linge', title: 'Lancer une machine', date: '2026-11-24', start: machineStart, end: machineStart + 5 },
    ] }))
    const root = document.querySelector('main')
    mountPlanningWorkspace(root, {
      uid, journal: () => ({}), planning: () => rows,
      formations: () => [], sport: () => ({ label: 'Fessiers' }),
    })
    const done = [...root.querySelectorAll('details.day-workspace-block')].find(node =>
      [...node.querySelectorAll('p')].some(text => text.textContent === 'Lancer une machine')
    ).querySelector('button')
    done.click()
    done.click()
    return JSON.parse(localStorage.getItem(key))
  }
  const today = build('wash-today', 840, [
    { heureDebut: '15:20', heureFin: '16:00', nom: 'Rendez-vous', rendezVous: true },
  ])
  assert.equal(today.bookings.length, 2)
  assert.equal(today.bookings[0].done, true)
  assert.deepEqual([today.bookings[1].title, today.bookings[1].start, today.bookings[1].end],
    ['Étendre le linge', 960, 970])
  t.mock.timers.setTime(new Date(2026, 10, 24, 23, 30).valueOf())
  const late = build('wash-late', 1410)
  assert.equal(late.bookings.length, 1)
  assert.equal(late.pending['linge-etendre'], '2026-11-25')
})

test('le bouton Rappels transmet le titre et l’heure des sous-tâches et rendez-vous Planity', t => {
  t.mock.timers.enable({ apis: ['Date'], now: new Date(2026, 10, 24, 14) })
  const dom = new JSDOM('<main></main>', { url: 'http://localhost' })
  globalThis.document = dom.window.document
  globalThis.localStorage = dom.window.localStorage
  const title = 'Étendre le linge & aérer'
  localStorage.setItem('emma:planning-v1:reminder-test', JSON.stringify({
    bookings: [{ id: 'linge-etendre', room: 'Linge', title, date: '2026-11-24', start: 960, end: 970 }],
  }))
  const root = document.querySelector('main')
  mountPlanningWorkspace(root, {
    uid: 'reminder-test', journal: () => ({}), planning: day => day === '2026-11-24' ? [
      { source: 'planity', nom: 'Cliente Exemple — Remplissage', heureDebut: '14:30', heureFin: '15:00' },
    ] : [],
    formations: () => [], sport: () => ({ label: 'Fessiers' }),
  })
  const urls = [...root.querySelectorAll('a')].filter(node => node.textContent === 'Mettre en rappel Apple').map(node => new URL(node.href))
  const reminder = urls.find(url => url.searchParams.get('text').startsWith(title))
  assert.equal(reminder.protocol, 'shortcuts:')
  assert.equal(reminder.hostname, 'run-shortcut')
  assert.equal(reminder.searchParams.get('name'), 'EMMA – Ajouter un rappel')
  assert.equal(reminder.searchParams.get('text'), title + '\n' + new Date(2026, 10, 24, 16).toISOString())
  assert.ok(urls.some(url => url.searchParams.get('text').startsWith('Mails\n')))
  const client = urls.find(url => url.searchParams.get('text').startsWith('Cliente Exemple'))
  assert.equal(client.searchParams.get('text'), 'Cliente Exemple\n' + new Date(2026, 10, 24, 14, 30).toISOString())
})

test('export avec formation journalière et changement de date après minuit', () => {
  const data = buildCalendar([
    { id: 'formation', date: '2026-11-23', title: 'Formation · 4 inscrites', allDay:true },
    { id: 'soiree', date: '2026-11-23', start: 1410, end: 1500, title:'Soirée, perso' },
  ], new Date('2026-11-23T10:00:00Z'))
  assert.match(data, /DTSTART;VALUE=DATE:20261123\r\nDTEND;VALUE=DATE:20261124/)
  assert.match(data, /DTEND:20261124T010000/)
  assert.ok(data.includes('Soirée\\, perso'))
})

test('une modification pendant la publication Apple est envoyée après le premier envoi', async t => {
  t.mock.timers.enable({ apis: ['Date'], now: new Date(2026, 10, 25, 12) })
  const dom = new JSDOM('<main></main>', { url: 'http://localhost' })
  globalThis.document = dom.window.document
  globalThis.localStorage = dom.window.localStorage
  localStorage.setItem('emma:planning-v1:publish-test', JSON.stringify({ calendarKey: 'test' }))
  const bookings = []
  const sent = []
  let releaseFirst
  const root = document.querySelector('main')
  const workspace = mountPlanningWorkspace(root, {
    uid: 'publish-test', journal: () => ({}), sport: () => ({ label: 'Fessiers' }),
    planning: day => day === '2026-11-25' ? bookings : [], formations: () => [],
    calendarLink: () => 'webcal://localhost/calendar',
    async publishCalendar({ calendar }) {
      sent.push(calendar)
      if (sent.length === 1) await new Promise(resolve => { releaseFirst = resolve })
    },
  })
  bookings.push({ nom: 'Rendez-vous après édition', heureDebut: '16:00', heureFin: '16:30', rendezVous: true })
  workspace.refresh()
  releaseFirst()
  await new Promise(setImmediate)
  assert.equal(sent.length, 2)
  assert.doesNotMatch(sent[0], /Rendez-vous après édition/)
  assert.match(sent[1], /Rendez-vous après édition/)
  assert.match(root.querySelector('[data-emma-calendar-status]').textContent, /Planning publié/)
  const refresh = [...root.querySelectorAll('button')].find(node => node.textContent === 'Actualiser le calendrier Apple')
  await refresh.onclick()
  assert.equal(sent.length, 3)
  assert.equal(sent[2], sent[1])
})

test('réimporter la même cliente au même créneau conserve un seul bloc visible', () => {
  const original = { source: 'planity', nom: 'Céline Exemple — Remplissage : 3 semaines', heureDebut: '14:30', heureFin: '16:00' }
  const { clients } = readDayAppointments([
    original,
    { ...original, nom: 'celine exemple — Remplissage 3 semaines' },
    { ...original, heureDebut: '17:00', heureFin: '18:30' },
  ])
  assert.deepEqual(clients.map(client => client.start), [870, 1020])
})

test('abonnement Apple : blocs regroupés et flux par couleur', async () => {
  const dom = new JSDOM('<main></main>', { url: 'http://localhost' })
  globalThis.document = dom.window.document
  globalThis.localStorage = dom.window.localStorage
  const date = new Date().toLocaleDateString('sv-SE')
  const bookings = [
    { room: 'Cuisine', start: 840, end: 860 },
    { room: 'Cuisine', start: 860, end: 880 },
    { room: 'Cuisine', start: 940, end: 950 },
    { room: 'Chambre', start: 900, end: 920 },
    { room: 'Salon', start: 905, end: 925 },
  ].map((task, id) => ({ ...task, date, id: String(id), title: 'Sous-tâche de ménage' }))
  localStorage.setItem('emma:planning-v1:calendar-test', JSON.stringify({ bookings, calendarKey: 'test' }))
  let feed
  mountPlanningWorkspace(document.querySelector('main'), {
    uid: 'calendar-test', journal: () => ({}), sport: () => ({ label: 'Fessiers' }),
    planning: day => day === date ? [{ heureDebut: '15:30', heureFin: '15:40', nom: 'Ongles', rendezVous: true }] : [],
    formations: day => day === date ? [{ title: 'Formation', count: 2 }] : [],
    calendarLink: (_, group) => 'webcal://localhost/calendar' + (group ? '?group=' + group : ''),
    publishCalendar: async ({ calendar }) => { feed = calendar },
  })
  assert.equal((feed.match(/SUMMARY:Cuisine\r\n/g) || []).length, 1)
  assert.match(feed, /T140000\r\nDTEND:\d{8}T144000\r\nSUMMARY:Cuisine/)
  assert.match(feed, /T150000\r\nDTEND:\d{8}T152500\r\nSUMMARY:Maison/)
  assert.match(feed, /SUMMARY:Ongles/)
  assert.match(feed, /SUMMARY:Formation · 2 inscrites/)
  assert.doesNotMatch(feed, /Maison ·|Sous-tâche de ménage/)
  assert.equal(document.querySelector('a[href$="?group=cuisine"]').textContent, 'Cuisine')

  const handler = makeCalendarHandler(() => ({ get: async () => ({ calendar: feed }) }))
  const url = 'https://calendar.test/?key=' + 'a'.repeat(64)
  const kitchen = await handler(new Request(url + '&group=cuisine'))
  assert.equal(kitchen.status, 200)
  const content = await kitchen.text()
  assert.match(content, /X-WR-CALNAME:EMMA · Cuisine\r\nX-APPLE-CALENDAR-COLOR:#D98B6C/)
  assert.deepEqual(content.match(/^SUMMARY:.*$/gm), ['SUMMARY:Cuisine'])
  const work = await handler(new Request(url + '&group=travail'))
  assert.deepEqual((await work.text()).match(/^SUMMARY:.*$/gm), ['SUMMARY:Formation · 2 inscrites'])
  assert.equal(await (await handler(new Request(url))).text(), feed)
  assert.equal((await handler(new Request(url + '&group=toString'))).status, 404)
})

test('accueil, ajout d’un rendez-vous et choix du repas', async () => {
  const dom = new JSDOM('<main></main>', { url: 'http://localhost' })
  globalThis.document = dom.window.document
  globalThis.localStorage = dom.window.localStorage
  const root = document.querySelector('main')
  const rows = [
    { source:'planity', heureDebut:'09:00', heureFin:'10:00', nom:'Cliente A' },
    { source:'planity', heureDebut:'18:00', heureFin:'19:00', nom:'Cliente B' },
  ]
  mountPlanningWorkspace(root, {
    uid:'test', planning:() => rows, journal:() => ({}), formations:() => [], sport:() => ({ label:'Fessiers' }),
    addAppointment: async (_, details) => rows.push({ ...details, rendezVous:true }),
  })
  assert.match(root.textContent, /Réveil conseillé 07:20/)
  const form = [...root.querySelectorAll('details')].find(item => item.firstChild.textContent === 'Ajouter un rendez-vous perso')
  const fields = form.querySelectorAll('input')
  fields[0].value = 'Restaurant'
  fields[1].value = '20:00'
  fields[2].value = '21:30'
  await form.querySelector('button').onclick()
  assert.match(root.textContent, /Tu manges où ce soir/)
  ;[...root.querySelectorAll('button')].find(item => item.textContent === 'À l’extérieur').click()
  const appointment = [...root.querySelectorAll('.day-workspace-positioned')].find(row => row.querySelector('summary').textContent === 'Restaurant')
  assert.ok(appointment)
  assert.equal(appointment.querySelector('summary').title, '20:00–21:30')
  const track = appointment.parentElement
  const before = [...track.children].slice(0, [...track.children].indexOf(appointment))
  const visualStart = before.reduce((position, row) => position + parseFloat(row.style.marginTop) +
    parseFloat(row.style.getPropertyValue('--day-slot-height')), parseFloat(appointment.style.marginTop))
  assert.ok(Math.abs(visualStart - 858) < 0.01)
  const robots = [...track.children].filter(row => row.textContent.includes('Roborock'))
  assert.equal(robots.length, 2)
  assert.equal(robots[1].previousElementSibling, robots[0])
  assert.equal(robots[1].style.marginTop, '4px')
  assert.ok(robots.every(row => !row.style.left && !row.style.width))
  const hours = [...root.querySelectorAll('.day-workspace-hour-mark')].map(node => node.textContent)
  assert.equal(hours.length, 18)
  assert.equal(hours[0], '07 h')
  assert.equal(hours.at(-1), '00 h')
  assert.doesNotMatch(root.textContent, / · Dîner/)
})

test('les quantités manquantes sont préremplies sans écraser celles indiquées', async () => {
  const items = [
    { nom: 'Skyr', quantite: 200, unite: 'g' },
    { nom: 'Farine', quantite: '', unite: 'g' },
    { nom: 'Œuf', quantite: 2, unite: '' },
  ]
  let calls = 0
  const estimate = async missing => {
    calls++
    assert.deepEqual(missing.map(item => item.index), [1, 2])
    return [
      { index: 0, quantite: 90, unite: 'g' },
      { index: 1, quantite: 150, unite: 'g' },
      { index: 2, quantite: 1, unite: 'pièce' },
    ]
  }
  const result = await completeNutritionQuantities(items, estimate, item => item)
  assert.deepEqual(result.map(item => [item.quantite, item.unite]), [[200, 'g'], [150, 'g'], [2, 'pièce']])
  assert.equal(items[1].quantite, '')
  await completeNutritionQuantities(result, estimate, item => item)
  assert.equal(calls, 1)
})

test('ouvrir la séance du jour remplace la durée de 30 minutes par 20', async () => {
  const dom = new JSDOM('<div id="hubPage" style="display:flex"><div id="hub-modules-grid"><div id="hub-planning-wrap"><div id="hub-planning-mini"></div></div></div>')
  const activite = { tempsDisponible: 30, tempsSportAuto: true }
  const entrainement = { actif: false }
  const noop = () => {}
  const context = {
    DB: { journal: {}, glow: { activite, entrainement } },
    currentUser: { uid: 'test' }, userRef: { collection: () => ({ doc: () => ({}) }) },
    document: dom.window.document, window: dom.window, location: { hostname: 'localhost' },
    renderHubPlanningMini: noop, renderJAujourdhui: noop, renderJHistorique: noop,
    renderGlowNutrition: noop, renderHistoriqueNutritionGlow: noop, syncAgendaVersJournal: noop,
    ouvrirMaisonDepuisHub: noop, assurerRappelsRepasJournal: noop, appliquerRoutinesFixesEmma: noop,
    actualiserPlanningAutomatiqueEmma: noop, renderGlowModule: noop, renderPlanificationRepasGlow: noop,
    initialiserGlowDuJour: noop, goModule: noop, renderGlowSport: noop,
    dateLocaleISO: () => '2026-11-25', bilanSportJourGlow: () => ({ minutes: 0 }),
    historiqueSportV2Glow: () => [], materielAutoriseGlow: () => true, joursHistoriqueNutritionGlow: () => [],
    testHome: { mountPlanningWorkspace: () => ({ refresh: noop, sync: noop }) },
    testGlow: { selectSport },
    console: { warn: (_, error) => { throw error } },
  }
  const source = readFileSync(new URL('../planning-workspace.js', import.meta.url), 'utf8')
    .replace(/import\('\.\/modules\/day-planning-home\.js[^']*'\)/, 'Promise.resolve(testHome)')
    .replace(/import\('\.\/modules\/day-planning-glow\.js[^']*'\)/, 'Promise.resolve(testGlow)')
  runInNewContext(source, context)
  await new Promise(setImmediate)
  const open = [...context.document.querySelectorAll('button')].find(button => button.textContent === 'Ouvrir Sport')
  open.click()
  assert.equal(activite.tempsDisponible, 20)
  assert.equal(activite.tempsSportAuto, false)
  entrainement.actif = true
  activite.tempsDisponible = 30
  open.click()
  assert.equal(activite.tempsDisponible, 30)
  dom.window.close()
})

test('choix Sport et ouverture du repas réellement mangé', async () => {
  assert.equal(selectSport('2026-11-24', [], false, true), 'fessiers')
  assert.equal(selectSport('2026-11-24', [{ date:'2026-11-23', objectif:'fessiers' }], false, true), 'taille')
  assert.equal(selectSport('2026-11-24', [], true, true), 'posture')
  const root = document.createElement('main')
  const logged = []
  mountNutritionAdvice(root, {
    suggest: async () => [{ name:'Poulet et riz', reason:'Rapide', ingredients:[], steps:[] }],
    log: (type, idea) => logged.push([type, idea.name]),
    analyze: async (type, description) => ({ name: description, items: [{nom:'Skyr',quantite:100,unite:'g'}] }),
    recipes: () => [{name:'Pancakes Skyr',ingredients:['100 g Skyr'],steps:[]}],
  })
  await root.querySelector('[data-meal=dejeuner] button').onclick()
  ;[...root.querySelectorAll('button')].find(item => item.textContent === 'J’ai mangé ça').click()
  assert.deepEqual(logged, [['dejeuner','Poulet et riz']])
  const snack = root.querySelector('[data-meal=collation]')
  snack.querySelectorAll('button')[1].click()
  root.querySelector('textarea').value = '100 g de Skyr'
  await root.querySelector('form').onsubmit({preventDefault(){}})
  assert.deepEqual(logged.at(-1), ['collation','100 g de Skyr'])
  ;[...root.querySelectorAll('button')].find(item => item.textContent === 'Mes recettes').click()
  assert.match(root.querySelector('.nutrition-results').textContent, /Pancakes Skyr/)

})

test('le bloc Admin réunit redevance, kit et montage après le rendez-vous choisi', t => {
  t.mock.timers.enable({ apis: ['Date'], now: new Date(2026, 10, 15, 7) })
  const dom = new JSDOM('<main></main>', { url: 'http://localhost' })
  globalThis.document = dom.window.document
  globalThis.localStorage = dom.window.localStorage
  let reminders
  const root = document.querySelector('main')
  mountPlanningWorkspace(root, {
    uid: 'admin-test', journal: () => ({}), sport: () => ({ label: 'Fessiers' }), formations: () => [],
    trainingStarts: day => day === '2026-11-17' ? [{ title: 'Formation test', count: 1 }] : [],
    planning: day => day === '2026-11-15' ? [{ source: 'planity', nom: 'Cliente Test', heureDebut: '10:00', heureFin: '11:00' }] : [],
    syncAdminNotifications: items => { reminders = items },
  })
  assert.match(root.textContent, /Factures de redevance/)
  assert.match(root.textContent, /Préparer le kit/)
  const select = [...root.querySelectorAll('label')].find(node => node.textContent.includes('Vidéo à prévoir')).querySelector('input')
  select.checked = true
  select.onchange()
  assert.match(root.textContent, /Monter et publier · Cliente Test/)
  assert.equal(reminders.find(item => item.filming).start, 600)
  assert.ok(reminders.find(item => item.title.startsWith('Monter')).start >= 660)
  root.querySelectorAll('button').forEach(button => { if (button.textContent === 'Pose filmée') button.click() })
  assert.ok(!reminders.some(item => item.filming))
  dom.window.close()
})
