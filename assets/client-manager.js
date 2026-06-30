// =============================================================================
//  Client Manager — dual-mode data layer
//
//  • Cloud mode  (Firebase configured in app-config.js): email/password login,
//    live Firestore sync, and the public edit-request inbox.
//  • Local mode  (not configured yet): everything is stored in this browser
//    (localStorage), exactly as before — so the tool works with zero setup.
// =============================================================================

import {
    firebaseConfig, COLLECTIONS, STRIPE, FIREBASE_SDK, firebaseReady
} from '/assets/app-config.js';

const CLOUD = firebaseReady();
const LOCAL_KEY = 'boosted_clients_v1';
const BILLING = ['', 'Active', 'Trialing', 'Past due', 'Canceled'];

let store = null;          // active backend
let clients = [];          // current client list (render source)
let incoming = [];         // incoming edit requests (cloud only)
let filter = 'all';
let query = '';

// ----------------------------------------------------------------------- utils
const $ = (id) => document.getElementById(id);
function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => (
        { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));
}
function money(n) { return '$' + (Number(n) || 0).toLocaleString('en-US'); }
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
function shortDate(d) {
    try { return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }); }
    catch (e) { return ''; }
}
function nextRenewal(day) {
    if (!day) return '—';
    const n = Number(day), now = new Date();
    let next = new Date(now.getFullYear(), now.getMonth(), n);
    if (next < new Date(now.getFullYear(), now.getMonth(), now.getDate())) {
        next = new Date(now.getFullYear(), now.getMonth() + 1, n);
    }
    return shortDate(next);
}

// =========================================================== Local (browser)
function localBackend() {
    let onClients = null;
    const read = () => { try { return JSON.parse(localStorage.getItem(LOCAL_KEY)) || []; } catch (e) { return []; } };
    const write = (arr) => localStorage.setItem(LOCAL_KEY, JSON.stringify(arr));
    let data = read();
    const emit = () => onClients && onClients(data.slice());

    return {
        mode: 'local',
        startClients(cb) { onClients = cb; emit(); },
        startRequests() { /* no public inbox in local mode */ },
        async upsert(c) {
            const i = data.findIndex(x => x.id === c.id);
            if (i >= 0) data[i] = c; else data.unshift(c);
            write(data); emit();
        },
        async remove(id) { data = data.filter(x => x.id !== id); write(data); emit(); },
        async replaceAll(arr) { data = arr.slice(); write(data); emit(); },
        snapshot() { return data.slice(); },
        async markRequest() {}, async deleteRequest() {}
    };
}

// ================================================================ Cloud (Firebase)
async function cloudBackend() {
    const [{ initializeApp }, authMod, fs] = await Promise.all([
        import(`${FIREBASE_SDK}/firebase-app.js`),
        import(`${FIREBASE_SDK}/firebase-auth.js`),
        import(`${FIREBASE_SDK}/firebase-firestore.js`)
    ]);
    const app = initializeApp(firebaseConfig);
    const auth = authMod.getAuth(app);
    const db = fs.getFirestore(app);
    const clientsCol = fs.collection(db, COLLECTIONS.clients);
    const requestsCol = fs.collection(db, COLLECTIONS.requests);

    const millis = (t) => (t && typeof t.toMillis === 'function') ? t.toMillis() : 0;

    const backend = {
        mode: 'cloud', auth, authMod,
        startClients(cb) {
            fs.onSnapshot(clientsCol, (snap) => {
                const arr = snap.docs.map(d => Object.assign({ id: d.id }, d.data()));
                arr.sort((a, b) => millis(b.createdAt) - millis(a.createdAt));
                cb(arr);
            }, (err) => console.error('clients snapshot', err));
        },
        startRequests(cb) {
            fs.onSnapshot(requestsCol, (snap) => {
                const arr = snap.docs.map(d => Object.assign({ id: d.id }, d.data()));
                arr.sort((a, b) => millis(b.createdAt) - millis(a.createdAt));
                cb(arr);
            }, (err) => console.error('requests snapshot', err));
        },
        async upsert(c) {
            const data = Object.assign({}, c);
            delete data.id;
            if (!data.createdAt) data.createdAt = fs.serverTimestamp();
            await fs.setDoc(fs.doc(db, COLLECTIONS.clients, c.id), data);
        },
        async remove(id) { await fs.deleteDoc(fs.doc(db, COLLECTIONS.clients, id)); },
        async replaceAll(arr) { for (const c of arr) await this.upsert(c); },
        async markRequest(id, done) {
            await fs.updateDoc(fs.doc(db, COLLECTIONS.requests, id), { status: done ? 'done' : 'open' });
        },
        async deleteRequest(id) { await fs.deleteDoc(fs.doc(db, COLLECTIONS.requests, id)); }
    };
    return backend;
}

// ============================================================== Rendering: stats
function renderStats() {
    const active = clients.filter(c => c.status === 'Active');
    $('stTotal').textContent = clients.length;
    $('stActive').textContent = active.length;
    $('stMrr').textContent = money(active.reduce((s, c) => s + (Number(c.fee) || 0), 0));
    $('stEdits').textContent = clients.reduce((s, c) => s + (Number(c.editsUsed) || 0), 0);
}

// ============================================================== Rendering: list
function renderList() {
    const list = $('list');
    const q = query.trim().toLowerCase();
    const rows = clients.filter(c => {
        if (filter !== 'all' && c.status !== filter) return false;
        if (!q) return true;
        return [c.business, c.contact, c.email].some(v => (v || '').toLowerCase().includes(q));
    });

    if (!rows.length) {
        list.innerHTML = '<div class="empty"><h3>' +
            (clients.length ? 'No clients match your search.' : 'No clients yet') + '</h3><p>' +
            (clients.length ? 'Try a different filter or search term.'
                            : 'Add your first client to start tracking care plans, renewals, and edit requests.') +
            '</p></div>';
        return;
    }

    const portal = STRIPE.PORTAL_LINK;
    list.innerHTML = rows.map(c => {
        const allowance = Number(c.allowance) || 0;
        const used = Number(c.editsUsed) || 0;
        const full = allowance && used >= allowance;
        const reqs = c.requests || [];
        const openReqs = reqs.filter(r => !r.done).length;
        const bill = c.billingStatus || '';
        return `
        <div class="client" data-id="${c.id}">
            <div class="client-head">
                <div>
                    <h3 class="client-title">${esc(c.business)}</h3>
                    <div class="client-contact">
                        ${c.contact ? esc(c.contact) : ''}${c.contact && (c.email || c.phone) ? ' · ' : ''}
                        ${c.email ? `<a href="mailto:${esc(c.email)}">${esc(c.email)}</a>` : ''}${c.email && c.phone ? ' · ' : ''}
                        ${c.phone ? esc(c.phone) : ''}
                    </div>
                </div>
                <span class="badge ${c.status}"><span class="dot"></span>${c.status}</span>
            </div>

            <div class="meta-grid">
                <div class="meta"><div class="k">Website</div><div class="v">${c.site ? `<a href="${esc(c.site)}" target="_blank" rel="noopener">${esc(c.site.replace(/^https?:\/\//, ''))}</a>` : '—'}</div></div>
                <div class="meta"><div class="k">Fee</div><div class="v">${money(c.fee)}/mo</div></div>
                <div class="meta"><div class="k">Next renewal</div><div class="v">${nextRenewal(c.billingDay)}</div></div>
                <div class="meta">
                    <div class="k">Edits this month</div>
                    <div class="v edits">
                        <button data-act="edit-minus">−</button>
                        <span class="count ${full ? 'full' : ''}">${used} / ${allowance || '∞'}</span>
                        <button data-act="edit-plus">+</button>
                    </div>
                </div>
                <div class="meta">
                    <div class="k">Billing</div>
                    <div class="v">
                        ${bill ? `<span class="bill bill-${bill.replace(/\s/g, '')}">${esc(bill)}</span>` : '<span class="bill bill-none">Not set</span>'}
                        ${portal ? ` · <a href="${esc(portal)}" target="_blank" rel="noopener">Manage in Stripe</a>` : ''}
                    </div>
                </div>
            </div>

            <div class="notes">${esc(c.notes)}</div>

            <div class="requests">
                <h4>Edit requests${openReqs ? ` · ${openReqs} open` : ''}</h4>
                ${reqs.length ? reqs.map(r => `
                    <div class="req ${r.done ? 'done' : ''}" data-rid="${r.id}">
                        <input type="checkbox" data-act="req-toggle" ${r.done ? 'checked' : ''} />
                        <span class="req-text">${esc(r.text)}</span>
                        <span class="req-date">${esc(r.date)}</span>
                        <span class="x" data-act="req-del" title="Delete request">×</span>
                    </div>`).join('') : '<div class="req-date">No requests logged.</div>'}
                <div class="req-add">
                    <input type="text" data-act="req-input" placeholder="Log a new edit request…" />
                    <button data-act="req-add">Add</button>
                </div>
            </div>

            <div class="client-actions">
                <button data-act="edit">Edit</button>
                <button class="danger" data-act="delete">Delete</button>
            </div>
        </div>`;
    }).join('');
}

// =========================================================== Rendering: inbox
function renderIncoming() {
    const wrap = $('inboxSection');
    if (!wrap) return;
    if (store.mode !== 'cloud') {
        wrap.style.display = '';
        $('inbox').innerHTML = '<div class="empty"><h3>Inbox activates with Firebase</h3>' +
            '<p>Once you connect Firebase, edit requests submitted at /request/ land here automatically. See SETUP.md.</p></div>';
        $('inboxCount').textContent = '';
        return;
    }
    const open = incoming.filter(r => r.status !== 'done').length;
    $('inboxCount').textContent = open ? `${open} open` : '';
    const box = $('inbox');
    if (!incoming.length) {
        box.innerHTML = '<div class="empty"><h3>No requests yet</h3><p>Edit requests submitted at /request/ will show up here.</p></div>';
        return;
    }
    box.innerHTML = incoming.map(r => `
        <div class="inq ${r.status === 'done' ? 'done' : ''}" data-rid="${r.id}">
            <div class="inq-head">
                <strong>${esc(r.business)}</strong>
                <span class="req-date">${r.createdAt ? shortDate(r.createdAt.toDate ? r.createdAt.toDate() : new Date()) : ''}</span>
            </div>
            <div class="inq-meta">${esc(r.name)}${r.name && r.email ? ' · ' : ''}${r.email ? `<a href="mailto:${esc(r.email)}">${esc(r.email)}</a>` : ''}</div>
            <div class="inq-details">${esc(r.details)}</div>
            ${r.link ? `<div class="inq-link"><a href="${esc(r.link)}" target="_blank" rel="noopener">${esc(r.link)}</a></div>` : ''}
            <div class="inq-actions">
                <button data-act="inq-toggle">${r.status === 'done' ? 'Reopen' : 'Mark handled'}</button>
                <button class="danger" data-act="inq-del">Delete</button>
            </div>
        </div>`).join('');
}

function renderAll() { renderStats(); renderList(); }

// =============================================================== Modal (add/edit)
function fillBillingOptions() {
    $('f_billing').innerHTML = BILLING.map(b =>
        `<option value="${b}">${b || '— not set —'}</option>`).join('');
}
function openModal(client) {
    $('modalTitle').textContent = client ? 'Edit Client' : 'Add Client';
    $('f_id').value = client ? client.id : '';
    $('f_business').value = client ? client.business || '' : '';
    $('f_contact').value = client ? client.contact || '' : '';
    $('f_status').value = client ? client.status || 'Building' : 'Building';
    $('f_email').value = client ? client.email || '' : '';
    $('f_phone').value = client ? client.phone || '' : '';
    $('f_site').value = client ? client.site || '' : '';
    $('f_fee').value = client ? (client.fee ?? 100) : 100;
    $('f_billingDay').value = client ? client.billingDay || '' : '';
    $('f_billing').value = client ? client.billingStatus || '' : '';
    $('f_allowance').value = client ? (client.allowance ?? 4) : 4;
    $('f_start').value = client ? client.start || '' : '';
    $('f_notes').value = client ? client.notes || '' : '';
    $('overlay').classList.add('open');
    $('f_business').focus();
}
function closeModal() { $('overlay').classList.remove('open'); $('clientForm').reset(); }

function findClient(id) { return clients.find(x => x.id === id); }

// =============================================================== Wiring
function wireEvents() {
    $('clientForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const id = $('f_id').value;
        const data = {
            business: $('f_business').value.trim(),
            contact: $('f_contact').value.trim(),
            status: $('f_status').value,
            email: $('f_email').value.trim(),
            phone: $('f_phone').value.trim(),
            site: $('f_site').value.trim(),
            fee: Number($('f_fee').value) || 0,
            billingDay: $('f_billingDay').value,
            billingStatus: $('f_billing').value,
            allowance: Number($('f_allowance').value) || 0,
            start: $('f_start').value,
            notes: $('f_notes').value.trim()
        };
        const existing = id && findClient(id);
        const merged = existing
            ? Object.assign({}, existing, data)
            : Object.assign({ id: uid(), editsUsed: 0, requests: [] }, data);
        await store.upsert(merged);
        closeModal();
    });

    $('list').addEventListener('click', async (e) => {
        const card = e.target.closest('.client'); if (!card) return;
        const c = findClient(card.getAttribute('data-id')); if (!c) return;
        const act = e.target.getAttribute('data-act');
        if (act === 'edit') return openModal(c);
        if (act === 'delete') {
            if (confirm('Delete ' + (c.business || 'this client') + '? This cannot be undone.')) await store.remove(c.id);
            return;
        }
        if (act === 'edit-plus') { c.editsUsed = (Number(c.editsUsed) || 0) + 1; await store.upsert(c); return; }
        if (act === 'edit-minus') { c.editsUsed = Math.max(0, (Number(c.editsUsed) || 0) - 1); await store.upsert(c); return; }
        if (act === 'req-add') {
            const input = card.querySelector('[data-act="req-input"]');
            const text = input.value.trim(); if (!text) return;
            c.requests = c.requests || [];
            c.requests.push({ id: uid(), text, date: shortDate(new Date()), done: false });
            await store.upsert(c); return;
        }
        if (act === 'req-del') {
            const rid = e.target.closest('.req').getAttribute('data-rid');
            c.requests = (c.requests || []).filter(r => r.id !== rid); await store.upsert(c); return;
        }
    });
    $('list').addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && e.target.getAttribute('data-act') === 'req-input') {
            e.preventDefault();
            e.target.closest('.req-add').querySelector('[data-act="req-add"]').click();
        }
    });
    $('list').addEventListener('change', async (e) => {
        if (e.target.getAttribute('data-act') !== 'req-toggle') return;
        const card = e.target.closest('.client');
        const c = findClient(card.getAttribute('data-id'));
        const rid = e.target.closest('.req').getAttribute('data-rid');
        const r = (c.requests || []).find(x => x.id === rid);
        if (r) { r.done = e.target.checked; await store.upsert(c); }
    });

    // Inbox actions (cloud)
    const inbox = $('inbox');
    if (inbox) inbox.addEventListener('click', async (e) => {
        const card = e.target.closest('.inq'); if (!card) return;
        const id = card.getAttribute('data-rid');
        const act = e.target.getAttribute('data-act');
        const r = incoming.find(x => x.id === id);
        if (act === 'inq-toggle') await store.markRequest(id, r.status !== 'done');
        if (act === 'inq-del') { if (confirm('Delete this request?')) await store.deleteRequest(id); }
    });

    // Controls
    $('addBtn').addEventListener('click', () => openModal(null));
    $('cancelBtn').addEventListener('click', closeModal);
    $('overlay').addEventListener('click', e => { if (e.target === $('overlay')) closeModal(); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && $('overlay').classList.contains('open')) closeModal(); });
    $('search').addEventListener('input', e => { query = e.target.value; renderList(); });
    $('filters').addEventListener('click', e => {
        const chip = e.target.closest('.chip'); if (!chip) return;
        document.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        filter = chip.getAttribute('data-status'); renderList();
    });
    $('resetMonthBtn').addEventListener('click', async () => {
        if (!clients.length) return;
        if (confirm("Reset this month's edit counters to 0 for all clients?")) {
            for (const c of clients) { c.editsUsed = 0; await store.upsert(c); }
        }
    });

    // Export / import (JSON)
    $('exportBtn').addEventListener('click', () => {
        const clean = clients.map(c => { const o = Object.assign({}, c); delete o.createdAt; return o; });
        const blob = new Blob([JSON.stringify(clean, null, 2)], { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'boosted-clients-' + new Date().toISOString().slice(0, 10) + '.json';
        a.click(); URL.revokeObjectURL(a.href);
    });
    $('importBtn').addEventListener('click', () => $('importFile').click());
    $('importFile').addEventListener('change', function (e) {
        const file = e.target.files[0]; if (!file) return;
        const reader = new FileReader();
        reader.onload = async () => {
            try {
                const data = JSON.parse(reader.result);
                if (!Array.isArray(data)) throw new Error('Not a client list');
                const incomingClients = data.map(c => Object.assign(
                    { id: uid(), editsUsed: 0, requests: [] }, c, { id: c.id || uid() }));
                const mode = clients.length
                    ? prompt('Type "merge" to add these to your current clients, or "replace" to overwrite everything.', 'merge')
                    : 'replace';
                if (mode === null) return;
                if (mode === 'replace') await store.replaceAll(incomingClients);
                else for (const c of incomingClients) await store.upsert(c);
                alert('Imported ' + incomingClients.length + ' client(s).');
            } catch (err) { alert('Could not import: ' + err.message); }
            e.target.value = '';
        };
        reader.readAsText(file);
    });

    // Migrate this browser's local data into the cloud (cloud mode only)
    const mig = $('migrateBtn');
    if (mig) mig.addEventListener('click', async () => {
        let local = [];
        try { local = JSON.parse(localStorage.getItem(LOCAL_KEY)) || []; } catch (e) {}
        if (!local.length) { alert('No clients found saved in this browser.'); return; }
        if (!confirm(`Upload ${local.length} client(s) from this browser to your account?`)) return;
        for (const c of local) await store.upsert(Object.assign({ editsUsed: 0, requests: [] }, c, { id: c.id || uid() }));
        alert(`Uploaded ${local.length} client(s).`);
    });
}

// =============================================================== Boot
function showApp() { $('loginScreen').style.display = 'none'; $('app').style.display = ''; }
function showLogin() { $('app').style.display = 'none'; $('loginScreen').style.display = ''; }

function startStore() {
    store.startClients((arr) => { clients = arr; renderAll(); });
    store.startRequests((arr) => { incoming = arr; renderIncoming(); });
    renderIncoming();
}

async function boot() {
    fillBillingOptions();
    wireEvents();

    if (!CLOUD) {
        // Local mode — no login, browser storage, local-mode banner.
        store = localBackend();
        document.body.classList.add('mode-local');
        $('modeBanner').style.display = 'block';
        showApp();
        startStore();
        return;
    }

    // Cloud mode — gate on auth.
    document.body.classList.add('mode-cloud');
    try {
        store = await cloudBackend();
    } catch (err) {
        console.error('Firebase init failed', err);
        $('loginErr').textContent = 'Could not reach Firebase. Check assets/app-config.js (see SETUP.md).';
        showLogin();
        return;
    }

    const { authMod, auth } = store;
    try { await authMod.setPersistence(auth, authMod.browserLocalPersistence); } catch (e) {}

    authMod.onAuthStateChanged(auth, (user) => {
        if (user) {
            $('whoami').textContent = user.email || 'Signed in';
            showApp();
            startStore();
        } else {
            showLogin();
        }
    });

    $('loginForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        $('loginErr').textContent = '';
        const btn = $('loginBtn'); btn.disabled = true; btn.textContent = 'Signing in…';
        try {
            await authMod.signInWithEmailAndPassword(auth, $('loginEmail').value.trim(), $('loginPass').value);
        } catch (err) {
            $('loginErr').textContent = friendlyAuthError(err);
        } finally { btn.disabled = false; btn.textContent = 'Sign in'; }
    });
    $('signOutBtn').addEventListener('click', () => authMod.signOut(auth));
}

function friendlyAuthError(err) {
    const code = (err && err.code) || '';
    if (code.includes('invalid-credential') || code.includes('wrong-password') || code.includes('user-not-found'))
        return 'Email or password is incorrect.';
    if (code.includes('too-many-requests')) return 'Too many attempts — try again in a bit.';
    if (code.includes('invalid-email')) return 'That email address looks off.';
    return 'Could not sign in. ' + (err && err.message ? err.message : '');
}

boot();
