function element(root, tag, text) {
  const node = document.createElement(tag)
  node.textContent = text
  root.append(node)
  return node
}

function button(root, label, action) {
  const node = element(root, 'button', label)
  node.type = 'button'
  node.className = 'btn bg bsm'
  node.onclick = action
  return node
}

export function selectSport(day, history, sore, treadmill) {
  if (sore) return 'posture'
  const past = history.filter(item => item.date <= day).sort((a, b) => b.date.localeCompare(a.date))
  const latest = past[0]
  if (latest?.date === day) return latest.objectif || 'posture'
  const dayNumber = Date.parse(day + 'T12:00:00Z') / 86400000
  const recentGlutes = past.some(item => (item.objectif === 'fessiers' || item.objectifs?.includes('fessiers')) &&
    dayNumber - Date.parse(item.date + 'T12:00:00Z') / 86400000 < 2)
  if (!recentGlutes) return 'fessiers'
  if (latest?.objectif !== 'taille') return 'taille'
  return treadmill ? 'tapis' : 'posture'
}

export function mountNutritionAdvice(root, bridge) {
  root.replaceChildren()
  element(root, 'h2', 'Qu’est-ce que je mange ?')
  const actions = element(root, 'div', '')
  actions.className = 'day-workspace-actions'
  const result = element(root, 'section', '')
  let busy = false
  async function suggest(type) {
    if (busy) return
    busy = true
    result.replaceChildren()
    element(result, 'p', 'EMMA cherche des idées de repas…')
    try {
      const ideas = await bridge.suggest(type)
      result.replaceChildren()
      for (const idea of ideas) {
        const card = element(result, 'details', '')
        element(card, 'summary', idea.name)
        element(card, 'p', idea.reason)
        if (idea.ingredients?.length) element(card, 'p', idea.ingredients.join(' · '))
        if (idea.steps?.length) {
          const list = element(card, 'ol', '')
          for (const step of idea.steps) element(list, 'li', step)
        }
        button(card, 'J’ai mangé ça', () => bridge.log(type, idea))
      }
      if (!ideas.length) element(result, 'p', 'Aucune idée disponible. Réessaie ou ouvre tes recettes.')
    } catch (error) {
      result.replaceChildren()
      element(result, 'p', error.message || 'Suggestions indisponibles. Réessaie.')
    } finally {
      busy = false
    }
  }
  button(actions, 'Midi', () => suggest('dejeuner'))
  button(actions, 'Soir', () => suggest('diner'))
  button(actions, 'Mes recettes', bridge.recipes)
  button(actions, 'Mon historique', bridge.history)
  button(actions, 'Noter un autre repas', bridge.manual)
  button(actions, 'Retour à Glow', bridge.back)
}
