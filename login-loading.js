(function showEmmaLoginProgress() {
  'use strict';
  const beginLogin = doLogin;
  const openHome = goHub;
  const lockSession = verrouillerSessionEmma;
  const loadData = loadAll;
  const openSession = appliquerSessionEmma;
  const readJournal = EmmaJournalStorage.load;
  const readPhotos = chargerPhotosJour;
  let loadingPanel;
  let delay;
  let phase = "Connexion";
  let progressMessage;

  function showPhase(text) {
    phase = text;
    if (progressMessage) progressMessage.textContent = text + "…";
  }

  function clearProgress() {
    clearTimeout(delay);
    loadingPanel?.remove();
    loadingPanel = undefined;
    progressMessage = undefined;
  }

  function showProgress() {
    if (loadingPanel) return loadingPanel;
    clearProgress();
    const panel = document.createElement('div');
    panel.id = 'emma-session-progress';
    panel.setAttribute('role', 'status');
    panel.style.cssText = 'position:fixed;inset:0;display:grid;place-content:center;text-align:center;padding:24px;z-index:1000;background:var(--bg,#f9f4f8)';
    const message = document.createElement('p');
    message.textContent = phase + '…';
    progressMessage = message;
    const retry = document.createElement('button');
    retry.className = 'btn bg';
    retry.type = 'button';
    retry.textContent = 'Recharger EMMA';
    retry.hidden = true;
    retry.onclick = () => location.reload();
    panel.append(message, retry);
    document.body.append(panel);
    loadingPanel = panel;
    delay = setTimeout(() => {
      message.textContent = phase + ' · plus long que prévu';
      retry.hidden = false;
    }, 15000);
    return panel;
  }

  appliquerSessionEmma = function (user) {
    if (user && emmaValidatedUid === user.uid && emmaOpenedUid !== user.uid) showProgress();
    return openSession.apply(this, arguments);
  };

  doLogin = async function () {
    if (emmaLoginInProgress ||
        !document.getElementById('loginEmail').value.trim() ||
        !document.getElementById('loginPwd').value) return beginLogin();
    showPhase('Connexion à EMMA');
    const panel = showProgress();
    try {
      await beginLogin();
    } finally {
      if (loadingPanel === panel && !chargementInitialEnCours) clearProgress();
    }
  };

  goHub = function () {
    try {
      return openHome.apply(this, arguments);
    } finally {
      clearProgress();
    }
  };

  verrouillerSessionEmma = function () {
    clearProgress();
    return lockSession.apply(this, arguments);
  };

  // Read the Journal alongside the other modules. Existing loadAll still
  // checks the result at its normal point before it marks the app writable.
  loadAll = async function () {
    const owner = userRef;
    if (!chargementInitialEnCours || !owner) return loadData.apply(this, arguments);
    showPhase('Chargement des données EMMA');
    const pending = readJournal(owner);
    pending.catch(() => {});
    const previousLoad = EmmaJournalStorage.load;
    const reuse = async ref => {
      if (ref !== owner) return previousLoad(ref);
      showPhase('Chargement du Journal');
      const journal = await pending;
      if (userRef === owner) showPhase('Chargement des autres rubriques');
      return journal;
    };
    EmmaJournalStorage.load = reuse;
    try {
      const result = await loadData.apply(this, arguments);
      if (userRef === owner && chargementReussi) showPhase('Préparation de l’accueil');
      return result;
    } finally {
      if (EmmaJournalStorage.load === reuse) EmmaJournalStorage.load = previousLoad;
    }
  };
  // Photos are optional on the home screen. Do not make opening EMMA wait
  // for the whole photo history. Merge only untouched dates in this session.
  chargerPhotosJour = async function () {
    const owner = userRef;
    if (!chargementInitialEnCours || !owner) return readPhotos.apply(this, arguments);
    const previous = { ...DB.photosJour };
    void owner.collection('photosParJour').get().then(snapshot => {
      if (userRef !== owner) return;
      const photos = { ...DB.photosJour };
      snapshot.forEach(doc => {
        if (photos[doc.id] === previous[doc.id]) photos[doc.id] = doc.data().entries || [];
      });
      DB.photosJour = photos;
    }).catch(error => console.warn('Historique photo indisponible', error));
  };
})();

