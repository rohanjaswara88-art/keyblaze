/* Live races: lobby, room, lanes and the typing box. The server owns the race (timing, places, speeds);
   this file shows its state and reports how far the player has typed. */
(function (root) {
  'use strict';

  const SOCKET_SCRIPT = '/socket.io/socket.io.js';
  const TICK_MS = 100;
  const PLACES = ['1st', '2nd', '3rd', '4th', '5th'];

  function escapeHtml(text) {
    return String(text).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src;
      s.onload = resolve;
      s.onerror = () => reject(new Error('Could not load the race client.'));
      document.head.appendChild(s);
    });
  }

  /** Characters typed once `index` words are complete, counting the spaces between them. */
  function charsBefore(words, index) {
    return words.slice(0, index).reduce((sum, w) => sum + w.length + 1, 0);
  }

  function create({ api, sound, fx }) {
    const $ = (id) => document.getElementById(id);
    const input = $('race-input');
    let socket = null;
    let connecting = null;
    let state = null; // last snapshot from the server
    let clockOffset = 0; // server time minus local time
    let words = [];
    let wordIndex = 0;
    let tick = null;
    let celebrated = false;

    function setError(message) {
      $('race-error').textContent = message || '';
      $('race-error').hidden = !message;
    }

    /* ---------- connection ---------- */

    function connect() {
      if (connecting) return connecting;
      connecting = (async () => {
        if (!root.io) await loadScript(SOCKET_SCRIPT);
        socket = root.io({ transports: ['websocket', 'polling'] });
        socket.on('race:hello', ({ name }) => { $('race-name').textContent = name; });
        socket.on('race:state', onState);
        socket.on('disconnect', () => {
          if (state) setError('Lost the connection to the race. Rejoin with the code.');
          showLobby();
        });
        return socket;
      })().catch((err) => {
        connecting = null;
        throw err;
      });
      return connecting;
    }

    async function send(event, payload) {
      setError('');
      try {
        const s = await connect();
        const res = await new Promise((resolve) => s.emit(event, payload || {}, resolve));
        if (!res.ok) setError(res.error);
        return res;
      } catch (err) {
        setError(err.message);
        return { ok: false };
      }
    }

    /* ---------- state ---------- */

    function onState(next) {
      clockOffset = next.serverNow - Date.now();
      const newPassage = !state || next.text !== state.text || (next.status === 'waiting' && state.status !== 'waiting');
      const justStarted = next.status === 'racing' && (!state || state.status !== 'racing');
      state = next;
      if (newPassage) {
        words = next.text.split(' ');
        wordIndex = 0;
        input.value = '';
        celebrated = false;
      }
      setUrl(next.code);
      render();
      if (justStarted) {
        input.disabled = false;
        input.focus();
      }
      const me = next.players[next.youIndex];
      if (me && me.place === 1 && !celebrated && fx) {
        celebrated = true;
        fx.confetti(['#ffffff', '#f0c2a8', '#a78bfa'], 120);
      }
    }

    function setUrl(code) {
      const url = new URL(root.location.href);
      if (code) url.searchParams.set('race', code);
      else url.searchParams.delete('race');
      root.history.replaceState(null, '', url);
    }

    /* ---------- rendering ---------- */

    function showLobby() {
      state = null;
      $('race-lobby').hidden = false;
      $('race-room').hidden = true;
      clearInterval(tick);
      tick = null;
      setUrl(null);
    }

    function statusText() {
      const ready = state.players.filter((p) => !p.left).length;
      if (state.status === 'waiting') {
        if (state.isPublic) return ready < 2 ? 'Looking for opponents…' : 'Starting soon…';
        return ready < 2 ? 'Share the code with a friend, or start solo.' : `${ready} racers ready`;
      }
      if (state.status === 'countdown') {
        const left = Math.max(0, state.startAt - (Date.now() + clockOffset));
        return `Get ready… ${Math.ceil(left / 1000) || 'go!'}`;
      }
      if (state.status === 'racing') return 'Go!';
      return 'Race over';
    }

    function renderLanes() {
      $('race-lanes').innerHTML = state.players.map((p, i) => {
        const pct = state.text.length ? Math.round((p.progress / state.text.length) * 100) : 0;
        const tags = [i === state.youIndex ? '<em>you</em>' : '', i === state.hostIndex ? '<em>host</em>' : '', p.left ? '<em>left</em>' : ''].join('');
        const place = p.place ? `<b class="lane-place p${p.place}">${PLACES[p.place - 1]}</b>` : '';
        return `<div class="lane ${i === state.youIndex ? 'mine' : ''} ${p.left ? 'gone' : ''}">` +
          `<div class="lane-top"><span class="lane-name">${escapeHtml(p.name)}${tags}</span>` +
          `<span class="lane-wpm">${place}${Math.round(p.wpm)} wpm</span></div>` +
          `<div class="lane-track"><div class="lane-fill" style="width:${pct}%"></div></div></div>`;
      }).join('');
    }

    function renderText() {
      const typed = input.value;
      $('race-text').innerHTML = words.map((w, i) => {
        if (i < wordIndex) return `<span class="rw done">${escapeHtml(w)}</span>`;
        if (i > wordIndex) return `<span class="rw">${escapeHtml(w)}</span>`;
        const ok = w.startsWith(typed.trimEnd());
        return `<span class="rw current ${ok ? '' : 'wrong'}">${escapeHtml(w)}</span>`;
      }).join(' ');
    }

    function render() {
      $('race-lobby').hidden = true;
      $('race-room').hidden = false;
      $('race-code-label').textContent = state.code;
      $('race-copy').hidden = state.isPublic;
      $('race-status').textContent = statusText();
      const isHost = state.youIndex === state.hostIndex;
      $('race-start').hidden = !(isHost && state.status === 'waiting');
      $('race-again').hidden = !(isHost && state.status === 'finished');
      const me = state.players[state.youIndex];
      const doneTyping = me && me.finished;
      input.disabled = state.status !== 'racing' || doneTyping;
      input.placeholder = state.status === 'racing' ? (doneTyping ? 'finished!' : 'type here…') : 'waiting for the start';
      $('race-hint').textContent = doneTyping && state.status === 'racing' ? 'Nice! Waiting for the others to finish.' : '';
      renderLanes();
      renderText();
      // The countdown needs a ticking clock between server updates.
      if (state.status === 'countdown' && !tick) {
        tick = setInterval(() => {
          if (!state || state.status !== 'countdown') {
            clearInterval(tick);
            tick = null;
            return;
          }
          $('race-status').textContent = statusText();
        }, TICK_MS);
      }
    }

    /* ---------- typing ---------- */

    /**
     * How many leading words of `value` are finished, and what is left over. One input event can hold
     * several words (fast typing, phone keyboards), so this consumes as many as are complete.
     */
    function consumeWords(value, from) {
      let rest = value;
      let index = from;
      while (index < words.length) {
        const word = words[index];
        const isLast = index === words.length - 1;
        if (isLast && rest === word) return { index: index + 1, rest: '' };
        if (!isLast && rest.startsWith(`${word} `)) {
          rest = rest.slice(word.length + 1);
          index += 1;
        } else {
          break;
        }
      }
      return { index, rest };
    }

    function onInput() {
      if (!state || state.status !== 'racing') return;
      const { index, rest } = consumeWords(input.value, wordIndex);
      if (index > wordIndex) {
        wordIndex = index;
        input.value = rest;
        if (sound) sound.key(true);
        const chars = wordIndex >= words.length ? state.text.length : charsBefore(words, wordIndex);
        send('race:progress', { chars });
      } else if (rest.endsWith(' ')) {
        if (sound) sound.error(); // space pressed on a misspelled word
      }
      renderText();
    }

    /* ---------- wiring ---------- */

    input.addEventListener('input', onInput);
    $('race-quick').addEventListener('click', () => send('race:quick'));
    $('race-create').addEventListener('click', () => send('race:create'));
    $('race-join-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const code = $('race-code').value.trim();
      if (code) send('race:join', { code });
    });
    $('race-start').addEventListener('click', () => send('race:start'));
    $('race-again').addEventListener('click', () => send('race:again'));
    $('race-leave').addEventListener('click', async () => {
      await send('race:leave');
      showLobby();
    });
    $('race-copy').addEventListener('click', async () => {
      const link = `${root.location.origin}${root.location.pathname}?race=${state.code}`;
      try {
        await root.navigator.clipboard.writeText(link);
        $('race-copy').textContent = 'copied!';
      } catch (err) {
        $('race-copy').textContent = link;
      }
      setTimeout(() => { $('race-copy').textContent = 'copy invite link'; }, 2000);
    });

    let checked = null;
    /** Called whenever the Race view opens. Shows the offline notice on a static host. */
    async function show() {
      if (!checked) checked = api.available();
      const online = await checked;
      $('race-offline').hidden = online;
      $('race-lobby').hidden = !online || Boolean(state);
      if (online && !state) connect().catch((err) => setError(err.message));
    }

    /** A ?race=CODE link joins that race straight away. Returns true when the Race view should open. */
    function joinFromUrl() {
      const code = new URL(root.location.href).searchParams.get('race');
      if (!code) return false;
      show().then(() => send('race:join', { code }));
      return true;
    }

    return { show, joinFromUrl };
  }

  root.TT = Object.assign(root.TT || {}, { race: { create, charsBefore } });
  if (typeof module !== 'undefined' && module.exports) module.exports = { charsBefore };
})(typeof window !== 'undefined' ? window : globalThis);
