(function showEmmaLoginProgress() {
  'use strict';
  const beginLogin = doLogin;
  const openHome = goHub;
  const lockSession = verrouillerSessionEmma;
  const loadData = loadAll;
  const openSession = appliquerSessionEmma;
  const readJournal = EmmaJournalStorage.load;
  const showPhotoHistory = ouvrirHistoriqueHumeurPhotos;
  const capturePhoto = handlePhotoJourCapturee;
  let captureInProgress = false;
  let photoHistoryOwner;
  let photoHistoryRead;
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
  // Old Journal photos are loaded only when their archive is opened.
  chargerPhotosJour = async function () {};

  ouvrirHistoriqueHumeurPhotos = async function () {
    const owner = userRef;
    if (!owner) return;
    if (photoHistoryOwner !== owner || !photoHistoryRead) {
      photoHistoryOwner = owner;
      photoHistoryRead = owner.collection('photosParJour').get();
    }
    try {
      const snapshot = await photoHistoryRead;
      if (userRef !== owner) return;
      DB.photosJour ||= {};
      snapshot.forEach(doc => {
        DB.photosJour[doc.id] ??= doc.data().entries || [];
      });
      showPhotoHistory.apply(this, arguments);
    } catch {
      if (photoHistoryOwner === owner) photoHistoryRead = undefined;
      if (userRef === owner) toast('Impossible de charger les anciennes photos. Réessaie.');
    }
  };

  handlePhotoJourCapturee = async function (event) {
    const owner = userRef;
    if (!owner || !event.target.files[0] || captureInProgress) return;
    captureInProgress = true;
    const day = new Date().toISOString().split('T')[0];
    try {
      const snapshot = await owner.collection('photosParJour').doc(day).get({source:'server'});
      if (userRef !== owner) return;
      DB.photosJour ||= {};
      DB.photosJour[day] = snapshot.exists ? snapshot.data().entries || [] : [];
      await capturePhoto.call(this, event);
    } catch {
      if (userRef === owner) toast('Impossible de vérifier les photos du jour. Réessaie.');
    } finally {
      captureInProgress = false;
    }
  };
})();
