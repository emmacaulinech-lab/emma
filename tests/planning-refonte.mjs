import assert from 'node:assert/strict'
import { test } from 'node:test'
import { JSDOM } from 'jsdom'
import { buildMorning, buildEvening } from '../modules/day-planning.js'
import { due, firstSlot, homeTasks, suggestHome } from '../modules/day-planning-quiz.js'
import { buildCalendar } from '../modules/day-planning-calendar.js'
import { mountPlanningWorkspace } from '../modules/day-planning-home.js'
import { mountNutritionAdvice, selectSport } from '../modules/day-planning-glow.js'

test('routine de 70 minutes, réveil anticipé et coucher à cheval sur minuit', () => {
  const result = buildMorning({ firstAppointmentStart: 540, actualWake: 420 })
  assert.equal(result.wake, 440)
  assert.deepEqual(result.earlyWindow, { start: 490, end: 510 })
  assert.equal(buildEvening({ nextWake: 540 }).bedtime, 1500)
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

test('export avec formation journalière et changement de date après minuit', () => {
  const data = buildCalendar([
    { id: 'formation', date: '2026-11-23', title: 'Formation · 4 inscrites', allDay:true },
    { id: 'soiree', date: '2026-11-23', start: 1410, end: 1500, title:'Soirée, perso' },
  ], new Date('2026-11-23T10:00:00Z'))
  assert.match(data, /DTSTART;VALUE=DATE:20261123\r\nDTEND;VALUE=DATE:20261124/)
  assert.match(data, /DTEND:20261124T010000/)
  assert.ok(data.includes('Soirée\\, perso'))
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
