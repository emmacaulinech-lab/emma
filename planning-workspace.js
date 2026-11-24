(function () {
  'use strict';
  const homeModule = import('./modules/day-planning-home.js?v=13');
  const glowModule = import('./modules/day-planning-glow.js?v=2');
  Promise.all([homeModule, glowModule]).then(([home, glow]) => {
    const oldPlanning = renderHubPlanningMini;
    const oldJournalDay = renderJAujourdhui;
    const oldNutrition = renderGlowNutrition;
    const oldHistory = renderHistoriqueNutritionGlow;
    const syncPlanity = syncAgendaVersJournal;
    const mounted = new WeakMap();
    const refresh = () => {
      if (document.getElementById('hubPage')?.style.display === 'flex' ||
          document.getElementById('module-journal')?.style.display === 'flex') renderHubPlanningMini();
    };
    const calendarHost = location.hostname.endsWith('--emmacaulinech.netlify.app')
      ? location.origin : 'https://emmacaulinech.netlify.app';
    const calendarEndpoint = calendarHost + '/.netlify/functions/calendrier-emma';
    const labels = { fessiers: 'Fessiers', taille: 'Gainage et abdos', posture: 'Posture', tapis: 'Marche sur tapis' };

    async function saveJournalAfter(change) {
      const ref = userRef;
      const undo = change();
      try {
        const saved = await EmmaJournalStorage.save(ref, DB.journal);
        if (!saved) throw Error('Sauvegarde indisponible.');
      } catch (error) {
        undo();
        throw error;
      }
    }

    function trainingFor(date) {
      const groups = new Map();
      for (const student of DB.formations?.etudiantes || []) {
        const start = dateSessionFormation(student.dateFormation);
        const end = dateSessionFormation(student.dateFinFormation) || start;
        if (!start || date < start || date > end || student.archive === true ||
            /annul|aband/i.test(String(student.statut || ''))) continue;
        const title = getLabelFormation(student.formation) || 'Formation';
        groups.set(title, (groups.get(title) || 0) + 1);
      }
      return [...groups].map(([title, count]) => ({ title, count }));
    }

    async function readWeek(file, weekStart) {
      if (!file.type.startsWith('image/')) throw Error('Choisis une capture d’écran de ton planning.');
      const apiKey = localStorage.getItem('anthropic_key');
      if (!apiKey) throw Error('Renseigne ta clé IA pour analyser la capture Planity.');
      const base64 = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result).split(',')[1]);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const response = await fetchIAAvecLoaderEmma('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type':'application/json', 'x-api-key':apiKey, 'anthropic-version':'2023-06-01',
          'anthropic-dangerous-direct-browser-access':'true' },
        body: JSON.stringify({ model:'claude-sonnet-4-6', max_tokens:8000, messages:[{
          role:'user', content:[
            { type:'image', source:{ type:'base64', media_type:file.type, data:base64 } },
            { type:'text', text:`Transcris la vue semaine Planity d’une seule collaboratrice. La capture provient de l’agenda d’Emma déjà filtré. Tous les blocs de rendez-vous visibles appartiennent donc à Emma, même si son nom, « Emma choisi(e) », le cadenas ou le symbole @ ne figurent pas sur le bloc. Ces mentions ne sont jamais des critères de sélection.
Premier jour de la semaine sélectionnée : ${weekStart}. Identifie chaque colonne par son en-tête de date, puis parcours chaque colonne de gauche à droite et de haut en bas. Compte d’abord séparément tous les blocs de rendez-vous de chaque colonne et vérifie que ta liste finale contient le même nombre par colonne.
Inclus chaque bloc client avec nom et horaires, quelle que soit sa couleur (rose, violet, vert foncé, etc.). Ignore les blocs gris de repos/indisponibilité, les cellules vides et les lignes de la grille. Garde les rendez-vous contigus comme entrées séparées. Si une prestation est tronquée, relève uniquement ce qui est lisible, ou laisse prestation vide. Ne supprime pas un rendez-vous lisible parce qu’une autre information est tronquée. N’invente aucun nom ni horaire. Lis les heures écrites sur le bloc et prends la date de l’en-tête de sa propre colonne.
Réponds uniquement par le tableau JSON exhaustif, trié par date et heure de début : [{"date":"AAAA-MM-JJ","debut":"HH:MM","fin":"HH:MM","nom":"Nom de la cliente","prestation":"Prestation lisible"}].` },
          ],
        }] }),
      });
      if (!response.ok) throw Error('Analyse Planity indisponible. Réessaie.');
      const result = await response.json();
      if (result.stop_reason === 'max_tokens') throw Error('L’analyse a été interrompue avant la fin. Réessaie avec une capture plus courte.');
      const raw = result.content?.map(item => item.text || '').join('').match(/\[[\s\S]*\]/)?.[0];
      if (!raw) throw Error('La capture n’a pas pu être lue.');
      const time = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
      const dates = new Set(Array.from({length:7}, (_, index) => {
        const day = new Date(weekStart + 'T12:00:00');
        day.setDate(day.getDate() + index);
        return dateLocaleISO(day);
      }));
      return JSON.parse(raw).filter(row => row && dates.has(row.date) && time.test(row.debut) && time.test(row.fin) &&
        row.debut < row.fin && typeof row.nom === 'string' && row.nom.trim())
        .sort((a, b) => a.date.localeCompare(b.date) || a.debut.localeCompare(b.debut));
    }

    function offerWeek(selected) {
      const dialog = document.createElement('dialog');
      dialog.className = 'day-workspace';
      const add = (tag, title, parent = dialog) => {
        const node = document.createElement(tag);
        node.textContent = title;
        parent.append(node);
        return node;
      };
      add('h3', 'Importer ma semaine Planity');
      const week = add('input', '', add('label', 'Premier jour de la semaine '));
      week.type = 'date';
      const monday = new Date(selected + 'T12:00:00');
      monday.setDate(monday.getDate() - (monday.getDay() + 6) % 7);
      week.value = dateLocaleISO(monday);
      add('p', 'Dans Planity, sélectionne uniquement ton agenda et garde les dates visibles en haut de la capture.');
      const image = add('input', '', add('label', 'Capture de la semaine '));
      image.type = 'file';
      image.accept = 'image/*';
      const status = add('p', '');
      const list = add('ul', '');
      const analyze = add('button', 'Analyser la capture');
      const confirm = add('button', 'Confirmer les rendez-vous cochés');
      const close = add('button', 'Fermer');
      confirm.hidden = true;
      let reviewed = [];
      analyze.onclick = async () => {
        if (!image.files[0] || !week.value) return;
        analyze.disabled = true;
        confirm.hidden = true;
        list.replaceChildren();
        status.textContent = 'Analyse en cours…';
        try {
          const rows = await readWeek(image.files[0], week.value);
          reviewed = rows.map(row => {
            const label = add('label', '', add('li', '', list));
            const check = add('input', '', label);
            check.type = 'checkbox';
            check.checked = true;
            label.append(row.date + ' · ' + row.debut + '–' + row.fin + ' · ' + row.nom);
            return { row, check };
          });
          const counts = new Map();
          for (const row of rows) counts.set(row.date, (counts.get(row.date) || 0) + 1);
          const summary = [...counts].map(([day, count]) =>
            new Date(day + 'T12:00:00').toLocaleDateString('fr-FR', {weekday:'short', day:'numeric'}) + ' : ' + count
          ).join(' · ');
          status.textContent = rows.length
            ? rows.length + ' rendez-vous détectés (' + summary + '). Compare avec Planity avant de confirmer.'
            : 'Aucun rendez-vous trouvé pour cette semaine.';
          confirm.hidden = !rows.length;
        } catch (error) {
          status.textContent = error.message;
        } finally {
          analyze.disabled = false;
        }
      };
      confirm.onclick = async () => {
        confirm.disabled = true;
        close.disabled = true;
        try {
          await saveJournalAfter(() => {
            const previous = new Map();
            const journal = DB.journal;
            for (const {row, check} of reviewed) {
              if (!check.checked) continue;
              const existing = journal.planning[row.date] || [];
              const name = row.nom.trim() + (row.prestation ? ' — ' + row.prestation : '');
              if (existing.some(item => item.source === 'planity' && item.heureDebut === row.debut &&
                item.heureFin === row.fin &&
                normaliserNomRoutineEmma((item.customNom || item.nom || '').split(' — ')[0]) ===
                  normaliserNomRoutineEmma(row.nom))) continue;
              if (!previous.has(row.date)) previous.set(row.date, journal.planning[row.date]);
              journal.planning[row.date] = [...existing, {
                id:genId(), nom:name, customNom:name, heureDebut:row.debut, heureFin:row.fin,
                duree:strToMin(row.fin)-strToMin(row.debut), source:'planity', verrouille:true,
              }];
            }
            return () => previous.forEach((blocks, date) => {
              if (blocks) journal.planning[date] = blocks;
              else delete journal.planning[date];
            });
          });
          dialog.close();
          refresh();
        } catch {
          status.textContent = 'L’import n’a pas pu être enregistré. Réessaie.';
          confirm.disabled = false;
          close.disabled = false;
        }
      };
      close.onclick = () => dialog.close();
      dialog.addEventListener('cancel', event => { if (confirm.disabled) event.preventDefault(); });
      dialog.addEventListener('close', () => dialog.remove());
      document.body.append(dialog);
      dialog.showModal();
    }

    function arrangeDashboard() {
      const grid = document.getElementById('hub-modules-grid');
      if (!grid || grid.classList.contains('refonte-dashboard')) return;
      const aside = document.createElement('aside');
      aside.className = 'refonte-sidebar';
      const shortcuts = document.createElement('div');
      shortcuts.className = 'refonte-shortcuts';
      aside.append(shortcuts);
      const add = (tag, text, parent, className) => {
        const node = document.createElement(tag);
        node.textContent = text;
        node.className = className || '';
        parent.append(node);
        return node;
      };
      const compta = add('button', 'Ma compta', shortcuts, 'refonte-shortcut');
      compta.type = 'button';
      compta.onclick = () => goModule('compta');
      const portal = add('a', 'LIMAGECILS PRO ↗', shortcuts, 'refonte-shortcut');
      portal.href = document.getElementById('limagecils-portal')?.href ||
        'https://emmacaulinech-lab.github.io/limagecils-facturation/';

      const preview = (title, id, actionLabel, action) => {
        const card = add('section', '', aside, 'refonte-preview');
        add('h3', title, card);
        add('div', '', card, 'refonte-preview-content').id = id;
        const actionButton = add('button', actionLabel, card, 'btn bg bsm');
        actionButton.type = 'button';
        actionButton.onclick = action;
      };
      preview('Sport', 'refonte-sport-apercu', 'Ouvrir Sport', () => {
        goModule('glow');
        renderGlowSport();
      });
      preview('Nutrition', 'refonte-nutrition-apercu', 'Qu’est-ce que je mange ?', () => {
        goModule('glow');
        renderGlowNutrition();
      });
      grid.append(aside);
      grid.classList.add('refonte-dashboard');
    }

    function refreshDashboardPreviews() {
      const day = dateLocaleISO();
      const workout = bilanSportJourGlow(day);
      const goal = glow.selectSport(day, historiqueSportV2Glow(), DB.glow?.activite?.etatSport === 'courbaturee',
        materielAutoriseGlow({materiel:['tapis_course']}));
      const meals = joursHistoriqueNutritionGlow().find(entry => entry.date === day)?.repas || [];
      const last = meals.at(-1);
      const dish = last?.nom || last?.aliments?.map(item => typeof item === 'string' ? item : item.nom).filter(Boolean).join(', ');
      const sportTitle = workout.minutes > 0 ? 'Sport aujourd’hui' : 'Séance du jour';
      const setPreview = (id, title, subtitle) => {
        const target = document.getElementById(id);
        if (!target) return;
        const heading = document.createElement('strong');
        heading.textContent = title;
        const detail = document.createElement('small');
        detail.textContent = subtitle;
        target.replaceChildren(heading, detail);
      };
      setPreview('refonte-sport-apercu', sportTitle,
        workout.minutes > 0 ? workout.minutes + ' min réalisées' : (labels[goal] || 'Sport') + ' · 20 min');
      setPreview('refonte-nutrition-apercu', meals.length ? meals.length + ' repas renseigné' + (meals.length > 1 ? 's' : '') : 'Aucun repas renseigné aujourd’hui',
        dish ? 'Dernier repas : ' + dish : 'Des idées adaptées à tes goûts et à ton historique');
    }

    renderHubPlanningMini = () => {
      if (!currentUser || !DB.journal) return oldPlanning();
      const wrap = document.getElementById('hub-planning-wrap');
      const mini = document.getElementById('hub-planning-mini');
      if (!wrap || !mini) return;
      arrangeDashboard();
      refreshDashboardPreviews();
      wrap.onclick = event => event.stopPropagation();
      wrap.onkeydown = event => event.stopPropagation();
      wrap.style.display = '';
      const inJournal = document.getElementById('module-journal')?.style.display === 'flex';
      const target = inJournal ? document.getElementById('jview-aujourdhui') : wrap;
      if (target && mini.parentElement !== target) target.replaceChildren(mini);
      const uid = currentUser.uid;
      if (mounted.get(mini)?.uid === uid) return mounted.get(mini).refresh();
      const workspace = home.mountPlanningWorkspace(mini, {
        uid,
        journal: () => DB.journal,
        planning: day => DB.journal.planning?.[day] || [],
        formations: trainingFor,
        calendarLink: key => calendarEndpoint.replace('https:', 'webcal:') + '?key=' + key,
        async publishCalendar(data) {
          if (currentUser?.uid !== uid) throw Error('Reconnecte-toi.');
          const token = await currentUser.getIdToken();
          const response = await fetch(calendarEndpoint, {
            method:'POST', headers:{'Content-Type':'application/json', Authorization:'Bearer ' + token},
            body:JSON.stringify(data),
          });
          if (!response.ok) throw Error('Calendrier indisponible.');
        },
        importPlanity: offerWeek,
        async prioritize(tasks) {
          if (!localStorage.getItem('anthropic_key')) return [];
          const result = await demanderJSONNutritionGlow(
            'Classe ces tâches Maison déjà sélectionnées par priorité, selon la dernière date de réalisation. ' +
            'Garde uniquement les identifiants fournis et réponds avec {"order":["id"]}. ' + JSON.stringify(tasks),
            'EMMA classe tes tâches Maison…');
          const known = new Set(tasks.map(item => item.id));
          return Array.isArray(result.order) ? [...new Set(result.order.filter(id => known.has(id)))] : [];
        },
        async addAppointment(date, details) {
          await saveJournalAfter(() => {
            const planning = DB.journal.planning;
            const previous = planning[date];
            const before = previous || [];
            if (home.readDayAppointments(before).clients.concat(home.readDayAppointments(before).personal)
              .some(item => item.start < strToMin(details.heureFin) && item.end > strToMin(details.heureDebut))) {
              throw Error('Ce créneau chevauche déjà un rendez-vous.');
            }
            const appointment = {
              ...details, id:genId(), nom:details.customNom, rendezVous:true, flexible:false,
              verrouille:true, iconOverride:'📌', categorie:'rdv',
            };
            planning[date] = [...before, appointment];
            return () => { planning[date] = (planning[date] || []).filter(item => item !== appointment); };

          });
        },
        sport(day) {
          const goal = glow.selectSport(day, historiqueSportV2Glow(), DB.glow?.activite?.etatSport === 'courbaturee',
            materielAutoriseGlow({materiel:['tapis_course']}));
          return {goal, label:labels[goal] || 'Sport'};
        },
        openSport(sport) {
          if (DB.glow.entrainement?.actif) { goModule('glow'); renderGlowSport(); return; }
          if (sport.goal !== 'tapis') {
            commencerSportPlanningAutoEmma({duree:20,data:{zones:[sport.goal]}}).catch(() => toast('Séance indisponible.'));
            return;
          }
          const custom = {
            id:'tapis_' + dateLocaleISO(), nom:'Marche sur tapis', objectif:'tapis', duree:20,
            exercices:[{exerciceId:'tapis_course_marche',tour:1}], tours:1,
            planTempsPersonnalise:[{exerciceIndex:0,dureeSecondes:1200,reposSecondes:0}],
          };
          glowSeancePreview=custom;
          goModule('glow');
          commencerSeance(custom.id).catch(() => toast('Séance indisponible.'));
        },
      });
      mounted.set(mini, { uid, refresh:workspace.refresh });
    };

    window.emmaPlanningRefonteActive = true;
    renderJAujourdhui = function () {
      if (!currentUser || !DB.journal) return oldJournalDay.apply(this, arguments);
      renderHubPlanningMini();
    };

    const oldHistoryJournal = renderJHistorique;
    renderJHistorique = function () {
      oldHistoryJournal.apply(this, arguments);
      if (!currentUser) return;
      const start = new Date((historiqueJourAffiche || dateLocaleISO()) + 'T12:00:00');
      start.setDate(start.getDate() - (start.getDay() + 6) % 7);
      const end = new Date(start);
      end.setDate(end.getDate() + 7);
      const from = dateLocaleISO(start);
      const to = dateLocaleISO(end);
      const entries = home.readPlanningHistory(currentUser.uid).filter(item => item.date >= from && item.date < to);
      if (!entries.length) return;
      const history = document.getElementById('jview-historique');
      const section = document.createElement('section');
      section.className = 'refonte-preview';
      const title = document.createElement('h3');
      title.textContent = 'Fait dans le planning';
      section.append(title);
      const list = document.createElement('ul');
      for (const entry of entries) {
        const item = document.createElement('li');
        const date = new Date(entry.date + 'T12:00:00').toLocaleDateString('fr-FR', {weekday:'short', day:'numeric', month:'short'});
        item.textContent = [date, entry.time, entry.title].filter(Boolean).join(' · ');
        list.append(item);
      }
      section.append(list);
      history.prepend(section);
      const empty = history.querySelector('.empty');
      if (empty?.textContent.trim() === 'Rien fait cette semaine') empty.remove();
    };

    syncAgendaVersJournal = async function () { await syncPlanity(); refresh(); };
    ouvrirMaisonDepuisHub = () => {
      goHub();
      document.getElementById('hub-planning-mini')?.querySelector('[data-open-quiz]')?.click();
    };

    renderHistoriqueNutritionGlow = function (date) {
      oldHistory(date);
      document.querySelector('#glow-content [onclick="renderPlanificationRepasGlow()"]')?.remove();
    };
    renderGlowNutrition = function (date) {
      if (date && date !== dateLocaleISO()) return oldNutrition(date);
      initialiserGlowDuJour();
      glow.mountNutritionAdvice(document.getElementById('glow-content'), {
        recipes: renderRecettesGlow,
        history: () => renderHistoriqueNutritionGlow(),
        manual: () => {
          window.glowConsommationDraft={date:dateLocaleISO(),type:new Date().getHours()<16?'dejeuner':'diner',nom:'',portions:1,portion:1,ingredients:[]};
          afficherConsommationV2Glow();
        },
        back: renderGlowModule,
        async suggest(type) {
          const recipes = recettesDisponiblesPlanGlow().map(({id,nom,ingredients}) => ({id,nom,ingredients})).slice(0, 25);
          const recent = joursHistoriqueNutritionGlow().slice(0, 7).flatMap(day => day.repas)
            .map(meal => meal.nom || meal.aliments?.map(item => item.nom || item).join(' · ')).filter(Boolean);
          const sport = bilanSportJourGlow(dateLocaleISO());
          const result = await demanderJSONNutritionGlow(
            'Propose 2 ou 3 idées variées pour ' + (type==='dejeuner'?'le déjeuner':'le dîner') +
            '. Objectifs : soutenir la progression fessiers et les séances, taille fine, repas équilibrés et assez nourrissants. Ne promets pas de résultat localisé ni de restriction calorique. ' +
            'Évite les repas récents et réutilise une recette enregistrée pertinente si possible. Goûts : fond de veau, ail, échalotes, herbes de Provence. ' +
            'Évite citron, asperges grillées, paprika, crevettes, brocoli, tofu, soja, gingembre, panais, champignons, curry, pois chiches, lentilles, tomates crues, saucisses, porc cuit, lait, avoine, noix, feta, thon, olives et miel ; pas de viande rouge le midi. ' +
            JSON.stringify({recipes,recent,sport:{minutes:sport.minutes,seances:sport.seances}}) +
            ' Réponds {"ideas":[{"name":"plat","reason":"raison courte","recipeId":null,"ingredients":[{"nom":"aliment","quantite":100,"unite":"g"}],"steps":["étape"]}]}. Quantités pour une portion.',
            'EMMA cherche ton repas…');
          return (Array.isArray(result.ideas) ? result.ideas : []).slice(0, 3).filter(item => typeof item?.name === 'string')
            .map(item => {
              const items = Array.isArray(item.ingredients) ? item.ingredients.filter(i => i?.nom && Number(i.quantite)>0 && i.unite) : [];
              return {...item, items, ingredients:items.map(i => i.quantite + ' ' + i.unite + ' ' + i.nom),
                steps:Array.isArray(item.steps)?item.steps.filter(step=>typeof step==='string'):[]};
            });
        },
        log(type, idea) {
          window.glowConsommationDraft={date:dateLocaleISO(), type, nom:idea.name, recetteId:idea.recipeId,
            portions:1, portion:1, ingredients:idea.items.map(item => ({...item}))};
          afficherConsommationV2Glow();
        },
      });
    };
    renderPlanificationRepasGlow = () => renderGlowNutrition();
    assurerRappelsRepasJournal = () => {};
    appliquerRoutinesFixesEmma = () => {};
    actualiserPlanningAutomatiqueEmma = async () => false;
    refresh();
  }).catch(error => console.warn('Nouvelle vue Planning indisponible', error));
})();
