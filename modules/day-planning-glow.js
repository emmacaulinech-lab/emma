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

export async function completeNutritionQuantities(items, estimate, normalize) {
  const missing = items.flatMap((item, index) =>
    item.quantite && item.unite ? [] : [{ ...item, index }])
  if (!missing.length) return items

  const estimates = await estimate(missing)
  const byIndex = new Map(estimates.map(item => [item?.index, item]))
  return items.map((item, index) => {
    if (item.quantite && item.unite) return item
    const suggested = normalize(byIndex.get(index) || {})
    if (!item.quantite && item.unite && suggested.unite &&
        item.unite.toLowerCase() !== suggested.unite.toLowerCase()) return item
    return { ...item, quantite: item.quantite || suggested.quantite, unite: item.unite || suggested.unite }
  })
}

const mealTypes = [
  ['petit-dejeuner', '☕', 'Petit-déjeuner'],
  ['dejeuner', '🥗', 'Déjeuner'],
  ['collation', '🍓', 'Collation'],
  ['diner', '🍽️', 'Dîner'],
]

function recipeDetails(root, recipe, emoji) {
  const card = element(root, 'details', '')
  card.className = 'nutrition-recipe'
  element(card, 'summary', emoji + ' ' + recipe.name)
  if (recipe.reason) element(card, 'p', recipe.reason)
  if (recipe.ingredients?.length) {
    const list = element(card, 'ul', '')
    for (const ingredient of recipe.ingredients) element(list, 'li', ingredient)
  }
  if (recipe.steps?.length) {
    const list = element(card, 'ol', '')
    for (const step of recipe.steps) element(list, 'li', step)
  }
  return card
}

export function mountNutritionAdvice(root, bridge) {
  root.replaceChildren()
  element(root, 'h2', 'Qu’est-ce que je mange ?')
  const actions = element(root, 'div', '')
  actions.className = 'day-workspace-actions'
  const grid = element(root, 'div', '')
  grid.className = 'nutrition-meal-grid'
  const result = element(root, 'section', '')
  result.className = 'nutrition-results'
  let request = 0

  async function suggest(type, emoji, label) {
    const id = ++request
    result.replaceChildren()
    element(result, 'p', 'EMMA cherche des idées…')
    result.scrollIntoView?.({ block: 'nearest' })
    try {
      const ideas = await bridge.suggest(type)
      if (id !== request) return
      result.replaceChildren()
      element(result, 'h3', 'Idées pour ' + label.toLowerCase())
      for (const idea of ideas) {
        const card = recipeDetails(result, idea, idea.emoji || emoji)
        button(card, 'J’ai mangé ça', () => bridge.log(type, idea))
      }
      if (!ideas.length) element(result, 'p', 'Aucune idée disponible. Réessaie ou ouvre tes recettes.')
    } catch (error) {
      if (id !== request) return
      result.replaceChildren()
      element(result, 'p', error.message || 'Suggestions indisponibles. Réessaie.')
    }
  }

  function manual(type, label) {
    request++
    result.replaceChildren()
    element(result, 'h3', 'Noter mon repas · ' + label)
    const form = element(result, 'form', '')
    const field = element(form, 'label', 'Ce que tu as mangé')
    const description = element(field, 'textarea', '')
    description.required = true
    description.maxLength = 2000
    description.rows = 3
    description.placeholder = 'Ex. un wrap au poulet, un œuf et un peu de mayo'
    const status = element(form, 'p', '')
    status.setAttribute('role', 'status')
    const analyze = element(form, 'button', 'Analyser mon plat')
    analyze.type = 'submit'
    analyze.className = 'btn bd'
    button(form, 'Saisir les ingrédients à la main', () => {
      request++
      analyze.disabled = false
      status.textContent = ''
      bridge.log(type, { name: description.value.trim(), items: [] })
    })
    form.onsubmit = async event => {
      event.preventDefault()
      const text = description.value.trim()
      if (!text || analyze.disabled) return
      const id = ++request
      analyze.disabled = true
      status.textContent = 'EMMA prépare une fiche à vérifier…'
      try {
        const idea = await bridge.analyze(type, text)
        if (id !== request) return
        status.textContent = ''
        bridge.log(type, idea)
      } catch (error) {
        if (id === request) status.textContent = error.message || 'Analyse indisponible. Réessaie ou saisis les ingrédients à la main.'
      } finally {
        analyze.disabled = false
      }
    }
    description.focus()
  }

  for (const [type, emoji, label] of mealTypes) {
    const card = element(grid, 'section', '')
    card.className = 'nutrition-meal-card'
    card.dataset.meal = type
    const icon = element(card, 'span', emoji)
    icon.setAttribute('aria-hidden', 'true')
    element(card, 'h3', label)
    const choices = element(card, 'div', '')
    choices.className = 'day-workspace-actions'
    button(choices, 'Me donner des idées', () => suggest(type, emoji, label))
    button(choices, 'Noter mon repas', () => manual(type, label))
  }

  button(actions, 'Mes recettes', () => {
    request++
    result.replaceChildren()
    element(result, 'h3', 'Mes recettes')
    const recipes = bridge.recipes()
    if (!recipes.length) element(result, 'p', 'Tes recettes enregistrées apparaîtront ici.')
    for (const recipe of recipes) recipeDetails(result, recipe, recipe.emoji || '🍴')
    result.scrollIntoView?.({ block: 'nearest' })
  })
  button(actions, 'Mon historique', () => { request++; bridge.history() })
  button(actions, '🏃 Sport', () => { request++; bridge.sport() })
}
