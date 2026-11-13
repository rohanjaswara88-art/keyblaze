/* Account card on the Profile view: sign in, create an account, sign out, and saved-result stats.
   Hidden entirely when the server is not available. */
(function (root) {
  'use strict';

  const FOOTER_GUEST = 'Keyblaze · progress is saved in this browser only';
  const SUMMARY_LIMIT = 1; // the summary comes with any results request; one row is enough

  function create({ api }) {
    const $ = (id) => document.getElementById(id);
    const card = $('account');
    const form = $('account-form');
    const errorEl = $('account-error');
    let user = null;
    let busy = false;

    function setError(message) {
      errorEl.textContent = message || '';
      errorEl.hidden = !message;
    }

    function setBusy(value) {
      busy = value;
      form.querySelectorAll('button, input').forEach((el) => { el.disabled = value; });
    }

    function render() {
      $('account-signed-out').hidden = Boolean(user);
      $('account-signed-in').hidden = !user;
      $('account-name').textContent = user ? user.username : '';
      $('site-footer').textContent = user ? `Keyblaze · signed in as ${user.username} · results are saved to your account` : FOOTER_GUEST;
    }

    async function refreshSummary() {
      if (!user) return;
      try {
        const { summary } = await api.results(SUMMARY_LIMIT);
        $('account-tests').textContent = String(summary.tests);
        $('account-best').textContent = String(Math.round(summary.best));
      } catch (err) {
        console.warn('Could not load account stats:', err);
      }
    }

    function setUser(next) {
      user = next;
      render();
      refreshSummary();
    }

    async function submit(action) {
      if (busy) return;
      const username = $('account-username').value.trim();
      const password = $('account-password').value;
      if (!username || !password) {
        setError('Enter a username and password.');
        return;
      }
      setError('');
      setBusy(true);
      try {
        const signedIn = action === 'register' ? await api.register(username, password) : await api.login(username, password);
        form.reset();
        setUser(signedIn);
      } catch (err) {
        setError(err.message);
      } finally {
        setBusy(false);
      }
    }

    async function logout() {
      try {
        await api.logout();
      } catch (err) {
        console.warn('Logout request failed; clearing the session locally anyway:', err);
      }
      setUser(null);
    }

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      submit(e.submitter && e.submitter.value === 'register' ? 'register' : 'login');
    });
    $('account-logout').addEventListener('click', logout);

    async function init() {
      if (!(await api.available())) return; // guest-only site: keep the card hidden
      card.hidden = false;
      try {
        setUser(await api.me());
      } catch (err) {
        console.warn('Could not load the signed-in user:', err);
        setUser(null);
      }
    }

    /** Saves a finished test to the account, if signed in. Never throws: the game must not break on a network error. */
    async function recordResult(entry) {
      if (!user) return;
      try {
        await api.saveResult(entry);
        refreshSummary();
      } catch (err) {
        if (err.status === 401) setUser(null); // session expired
        console.warn('Could not save the result to your account:', err);
      }
    }

    return { init, recordResult, username: () => (user ? user.username : null) };
  }

  root.TT = Object.assign(root.TT || {}, { account: { create } });
})(typeof window !== 'undefined' ? window : globalThis);
