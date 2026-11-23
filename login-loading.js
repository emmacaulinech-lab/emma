(function showEmmaLoginProgress() {
  'use strict';
  const beginLogin = doLogin;
  const openHome = goHub;
  const lockSession = verrouillerSessionEmma;
  const loadData = loadAll;
  const openSession = appliquerSessionEmma;
  const readJournal = EmmaJournalStorage.load;
  let loadingPanel;
  let delay;

  function clearProgress() {
    clearTimeout(delay);
    loadingPanel?.remove();
    loadingPanel = undefined;
  }

  function showProgress() {
    if (loadingPanel) return loadingPanel;
    clearProgress();
    const panel = document.createElement('div');
    panel.id = 'emma-session-progress';
    panel.setAttribute('role', 'status');
    panel.style.cssText = 'position:fixed;inset:0;display:grid;place-content:center;text-align:center;padding:24px;z-index:1000;background:var(--bg,#f9f4f8)';
    const message = document.createElement('p');
    message.textContent = 'Connexion à EMMA…';
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
      message.textContent = 'EMMA met plus de temps que prévu à charger tes données.';
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
    const panel = showProgress();
    try {
      await beginLogin();
    } finally {
      if (loadingPanel === panel) clearProgress();
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
    const pending = readJournal(owner);
    pending.catch(() => {});
    const previousLoad = EmmaJournalStorage.load;
    const reuse = ref => ref === owner ? pending : previousLoad(ref);
    EmmaJournalStorage.load = reuse;
    try {
      return await loadData.apply(this, arguments);
    } finally {
      if (EmmaJournalStorage.load === reuse) EmmaJournalStorage.load = previousLoad;
    }
  };
})();
