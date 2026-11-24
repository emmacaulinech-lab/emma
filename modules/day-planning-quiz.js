const tasks = [
  ['draps', 'Chambre', 'Changer les draps et les taies', 15, 3],
  ['vasque', 'Salle de bain', 'Ranger le dessus de la vasque', 5, 2],
  ['douche', 'Salle de bain', 'Nettoyer la douche complète', 40, 'month', 'Vitre, robinetterie et joints'],
  ['baignoire', 'Salle de bain', 'Nettoyer la baignoire', 20],
  ['chambre', 'Chambre', 'Ranger les vêtements et dégager les surfaces', 10],
  ['sol-chambre', 'Chambre', 'Nettoyer le sol', 15, null, 'Ramasser les poils, aspirer ou laver selon son état'],
  ['poussiere', 'Chambre', 'Faire les poussières', 15],
  ['entretien-chambre', 'Chambre', 'Entretenir la chambre en profondeur', 40, null, 'Dessous du lit, matelas ou panier des chiens'],
  ['coiffeuse', 'Chambre', 'Entretenir la coiffeuse', 30, null, 'Dégager le dessus, trier un tiroir ou nettoyer les accessoires'],
  ['surfaces-cuisine', 'Cuisine', 'Nettoyer les surfaces', 10, null, 'Façades, poignées et traces visibles'],
  ['lave-vaisselle', 'Cuisine', 'Vider le lave-vaisselle', 5],
  ['four', 'Cuisine', 'Nettoyer l’intérieur du four', 35],
  ['frigo', 'Cuisine', 'Nettoyer l’intérieur du frigo', 40],
  ['canape', 'Salon', 'Dépoiler le canapé', 10],
  ['surfaces-salon', 'Salon', 'Ranger ou dépoussiérer les surfaces', 10],
  ['sol-salon', 'Salon', 'Laver le sol', 15],
  ['entree', 'Entrée', 'Ranger les chaussures, vestes et sacs', 10],
  ['sol-entree', 'Entrée', 'Nettoyer le sol', 15],
  ['retouches', 'Salle de bain', 'Essuyer les traces', 5, null, 'Miroir ou vitre de douche'],
  ['linge', 'Linge', 'Lancer une machine', 5],
]
export const homeTasks = tasks.map(([id, room, title, duration, repeat, detail]) =>
  ({ id, room, title, duration, repeat, detail }))

export function due(task, last, day) {
  if (!task.repeat) return false
  if (!last) return true
  const date = new Date(last + 'T12:00:00')
  if (task.repeat === 'month') {
    const target = new Date(date.getFullYear(), date.getMonth() + 2, 0).getDate()
    date.setMonth(date.getMonth() + 1, Math.min(target, date.getDate()))
  } else {
    date.setDate(date.getDate() + task.repeat)
  }
  return date.toLocaleDateString('sv-SE') <= day
}

export function firstSlot(occupied, start, end, duration) {
  let cursor = start
  for (const block of [...occupied].sort((a, b) => a.start - b.start)) {
    if (block.end <= cursor) continue
    if (block.start >= cursor + duration) break
    cursor = Math.max(cursor, block.end)
  }
  return cursor + duration <= end ? { start: cursor, end: cursor + duration } : null
}

export function suggestHome(tasks, days) {
  const result = []
  const occupied = days.map(day => [...day.occupied])
  for (const task of tasks) {
    const order = days.map((day, index) => ({ ...day, index }))
    if (task.duration >= 25) order.sort((a, b) => Number(a.works) - Number(b.works))
    for (const day of order) {
      if (day.canBook && !day.canBook(task)) continue
      const slot = firstSlot(occupied[day.index], day.start, day.end, task.duration)
      if (!slot) continue
      occupied[day.index].push(slot)
      result.push({ ...task, ...slot, date: day.date })
      break
    }
  }
  return result.sort((a, b) => a.date.localeCompare(b.date) || a.start - b.start)
}
