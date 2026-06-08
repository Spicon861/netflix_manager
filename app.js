/* =============================================
   STREAMCONTROL — app.js
   ============================================= */

// =============================================
// SUPABASE CONFIG
// =============================================
const SUPABASE_URL = 'https://ooyffxedzxtrypmdwnwx.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9veWZmeGVkenh0cnlwbWR3bnd4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA1MDE0NDAsImV4cCI6MjA5NjA3NzQ0MH0.cFcC6soKnGF4XtAmMHn6ragfXuFWg39yxDVwTVYZdcY';

const HEADERS = {
  'Content-Type':  'application/json',
  'apikey':        SUPABASE_KEY,
  'Authorization': `Bearer ${SUPABASE_KEY}`,
  'Prefer':        'return=representation'
};

// =============================================
// DB HELPERS
// =============================================
async function dbGet(table, query = '') {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}?order=created_at.asc${query}`, { headers: HEADERS });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

async function dbInsert(table, row) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: 'POST', headers: HEADERS, body: JSON.stringify(row)
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

async function dbUpdate(table, id, changes) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}?id=eq.${id}`, {
    method: 'PATCH', headers: HEADERS, body: JSON.stringify(changes)
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

async function dbDelete(table, id) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}?id=eq.${id}`, {
    method: 'DELETE', headers: HEADERS
  });
  if (!r.ok) throw new Error(await r.text());
}

// =============================================
// APP STATE
// =============================================
let data = { accounts: [], clients: [], payments: [] };
let selectedAccountId = null;
let currentPage      = 'cuentas';
let balanceView      = 'year';   // 'year' | 'month'
let mainChartInstance  = null;
let donutChartInstance = null;

// =============================================
// SYNC UI
// =============================================
function setSyncing() {
  document.getElementById('syncDot').className  = 'sync-dot syncing';
  document.getElementById('syncText').textContent = 'Guardando...';
}
function setSynced() {
  document.getElementById('syncDot').className  = 'sync-dot';
  document.getElementById('syncText').textContent = 'Sincronizado';
}
function setSyncError() {
  document.getElementById('syncDot').className  = 'sync-dot error';
  document.getElementById('syncText').textContent = 'Error';
}

// =============================================
// TOAST
// =============================================
function showToast(msg, type = 'success') {
  const t = document.getElementById('toast');
  t.textContent  = msg;
  t.className    = `toast ${type} show`;
  setTimeout(() => { t.className = `toast ${type}`; }, 2500);
}

// =============================================
// HELPERS
// =============================================
function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

function daysLeft(ds) {
  if (!ds) return null;
  const today = new Date(); today.setHours(0,0,0,0);
  const d     = new Date(ds); d.setHours(0,0,0,0);
  return Math.ceil((d - today) / 86400000);
}

function formatDate(ds) {
  if (!ds) return '—';
  const [y, m, d] = ds.split('-');
  return `${d}/${m}/${y}`;
}

function daysLabel(d) {
  if (d === null) return '';
  if (d < 0)     return `Venció hace ${Math.abs(d)}d`;
  if (d === 0)   return 'Vence hoy';
  return `${d}d restantes`;
}

function statusColor(d) {
  if (d === null) return 'green';
  if (d < 0)     return 'red';
  if (d <= 7)    return 'yellow';
  return 'green';
}

function formatCOP(p) {
  if (!p && p !== 0) return '—';
  return '$' + parseInt(p).toLocaleString('es-CO');
}

function formatCOPShort(p) {
  if (!p || p === 0) return '$0';
  const n = parseInt(p);
  if (n >= 1000000) return '$' + (n / 1000000).toFixed(1) + 'M';
  if (n >= 1000)    return '$' + (n / 1000).toFixed(0) + 'K';
  return '$' + n;
}

function todayStr() {
  return new Date().toISOString().split('T')[0];
}

function monthKey(ds) {
  return ds ? ds.slice(0, 7) : '';
}

function yearKey(ds) {
  return ds ? ds.slice(0, 4) : '';
}

function monthLabel(ym) {
  if (!ym) return '';
  const [y, m] = ym.split('-');
  const names  = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
  return `${names[parseInt(m) - 1]} ${y}`;
}

// =============================================
// PAGE NAVIGATION
// =============================================
function showPage(name) {
  currentPage = name;
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
  document.getElementById(`page-${name}`).classList.add('active');
  document.querySelectorAll('.nav-tab')[name === 'cuentas' ? 0 : 1].classList.add('active');

  document.getElementById('headerCuentasBtns').style.display = name === 'cuentas' ? '' : 'none';
  document.getElementById('headerBalanceBtns').style.display = name === 'balance' ? '' : 'none';

  if (name === 'balance') renderBalance();
}

// =============================================
// MOBILE TABS
// =============================================
function switchTab(tab, btn) {
  document.querySelectorAll('[data-tab]').forEach(p => p.classList.remove('tab-active'));
  document.querySelector(`[data-tab="${tab}"]`).classList.add('tab-active');
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
}

// =============================================
// MODALS
// =============================================
function openModal(id) {
  document.getElementById(id).classList.add('open');
  if (id === 'clientModal')     populateAccountSelect('cli-account');
  if (id === 'editClientModal') populateAccountSelect('edit-cli-account');
}

function closeModal(id) {
  document.getElementById(id).classList.remove('open');
}

document.querySelectorAll('.modal-overlay').forEach(m => {
  m.addEventListener('click', e => { if (e.target === m) m.classList.remove('open'); });
});

function populateAccountSelect(selId) {
  const sel = document.getElementById(selId);
  const cur = sel.value;
  sel.innerHTML = '<option value="">Sin asignar</option>' +
    data.accounts.map(a => `<option value="${a.id}">${a.email}</option>`).join('');
  if (cur) sel.value = cur;
}

// =============================================
// ACCOUNTS — CRUD
// =============================================
async function saveAccount() {
  const email    = document.getElementById('acc-email').value.trim();
  const password = document.getElementById('acc-password').value.trim();
  const expiry   = document.getElementById('acc-expiry').value;
  const slots    = parseInt(document.getElementById('acc-slots').value) || 4;
  const cost     = document.getElementById('acc-cost').value || null;
  const notes    = document.getElementById('acc-notes').value.trim();

  if (!email || !expiry) { showToast('Correo y fecha son obligatorios', 'error'); return; }

  const row = { id: uid(), email, password, expiry, slots, cost, notes };
  setSyncing();
  try {
    await dbInsert('accounts', row);
    data.accounts.push(row);
    closeModal('accountModal');
    ['acc-email','acc-password','acc-expiry','acc-slots','acc-cost','acc-notes']
      .forEach(i => document.getElementById(i).value = '');
    setSynced();
    showToast('Cuenta guardada ✓');
    render();
  } catch (e) { setSyncError(); showToast('Error: ' + e.message, 'error'); }
}

function openEditAccount(id) {
  const a = data.accounts.find(x => x.id === id);
  if (!a) return;
  document.getElementById('edit-acc-id').value       = a.id;
  document.getElementById('edit-acc-email').value    = a.email;
  document.getElementById('edit-acc-password').value = a.password || '';
  document.getElementById('edit-acc-expiry').value   = a.expiry || '';
  document.getElementById('edit-acc-slots').value    = a.slots || 4;
  document.getElementById('edit-acc-cost').value     = a.cost || '';
  document.getElementById('edit-acc-notes').value    = a.notes || '';
  openModal('editAccountModal');
}

async function updateAccount() {
  const id = document.getElementById('edit-acc-id').value;
  const changes = {
    email:    document.getElementById('edit-acc-email').value.trim(),
    password: document.getElementById('edit-acc-password').value.trim(),
    expiry:   document.getElementById('edit-acc-expiry').value,
    slots:    parseInt(document.getElementById('edit-acc-slots').value) || 4,
    cost:     document.getElementById('edit-acc-cost').value || null,
    notes:    document.getElementById('edit-acc-notes').value.trim(),
  };
  setSyncing();
  try {
    await dbUpdate('accounts', id, changes);
    const idx = data.accounts.findIndex(x => x.id === id);
    if (idx !== -1) data.accounts[idx] = { ...data.accounts[idx], ...changes };
    closeModal('editAccountModal');
    setSynced();
    showToast('Cuenta actualizada ✓');
    render();
  } catch (e) { setSyncError(); showToast('Error al actualizar', 'error'); }
}

function deleteAccount(id) {
  const acc = data.accounts.find(a => a.id === id);
  if (!acc) return;
  document.getElementById('confirmBody').innerHTML =
    `¿Eliminar la cuenta <span class="confirm-subject">${acc.email}</span>? Los clientes asignados quedarán sin cuenta.`;
  document.getElementById('confirmOkBtn').onclick = async () => {
    closeModal('confirmModal'); setSyncing();
    try {
      const linked = data.clients.filter(c => c.account_id === id);
      for (const c of linked) {
        await dbUpdate('clients', c.id, { account_id: null });
        c.account_id = null;
      }
      await dbDelete('accounts', id);
      data.accounts = data.accounts.filter(a => a.id !== id);
      if (selectedAccountId === id) selectedAccountId = null;
      setSynced(); showToast('Cuenta eliminada'); render();
    } catch (e) { setSyncError(); showToast('Error al eliminar', 'error'); }
  };
  openModal('confirmModal');
}

// =============================================
// CLIENTS — CRUD
// =============================================
async function saveClient() {
  const name       = document.getElementById('cli-name').value.trim();
  const phone      = document.getElementById('cli-phone').value.trim();
  const account_id = document.getElementById('cli-account').value || null;
  const start_date = document.getElementById('cli-start').value || null;
  const expiry     = document.getElementById('cli-expiry').value;
  const price      = document.getElementById('cli-price').value;
  const profile    = document.getElementById('cli-profile').value.trim();

  if (!name || !expiry) { showToast('Nombre y fecha son obligatorios', 'error'); return; }

  const row = { id: uid(), name, phone, account_id, start_date, expiry, price, profile };
  setSyncing();
  try {
    await dbInsert('clients', row);
    data.clients.push(row);

    // Auto-register income if price provided
    if (price && parseInt(price) > 0) {
      const pay = {
        id: uid(), type: 'income', amount: parseInt(price),
        description: `Cobro a ${name}`,
        related_id: row.id, payment_date: start_date || todayStr()
      };
      await dbInsert('payments', pay);
      data.payments.push(pay);
    }

    closeModal('clientModal');
    ['cli-name','cli-phone','cli-start','cli-expiry','cli-price','cli-profile']
      .forEach(i => document.getElementById(i).value = '');
    document.getElementById('cli-account').value = '';
    setSynced(); showToast('Cliente agregado ✓'); render();
  } catch (e) { setSyncError(); showToast('Error: ' + e.message, 'error'); }
}

function openEditClient(id) {
  const c = data.clients.find(x => x.id === id);
  if (!c) return;
  document.getElementById('edit-cli-id').value      = c.id;
  document.getElementById('edit-cli-name').value    = c.name;
  document.getElementById('edit-cli-phone').value   = c.phone || '';
  document.getElementById('edit-cli-start').value   = c.start_date || '';
  document.getElementById('edit-cli-expiry').value  = c.expiry || '';
  document.getElementById('edit-cli-price').value   = c.price || '';
  document.getElementById('edit-cli-profile').value = c.profile || '';
  openModal('editClientModal');
  setTimeout(() => {
    populateAccountSelect('edit-cli-account');
    document.getElementById('edit-cli-account').value = c.account_id || '';
  }, 50);
}

async function updateClient() {
  const id = document.getElementById('edit-cli-id').value;
  const changes = {
    name:       document.getElementById('edit-cli-name').value.trim(),
    phone:      document.getElementById('edit-cli-phone').value.trim(),
    account_id: document.getElementById('edit-cli-account').value || null,
    start_date: document.getElementById('edit-cli-start').value || null,
    expiry:     document.getElementById('edit-cli-expiry').value,
    price:      document.getElementById('edit-cli-price').value,
    profile:    document.getElementById('edit-cli-profile').value.trim(),
  };
  setSyncing();
  try {
    await dbUpdate('clients', id, changes);
    const idx = data.clients.findIndex(x => x.id === id);
    if (idx !== -1) data.clients[idx] = { ...data.clients[idx], ...changes };
    closeModal('editClientModal');
    setSynced(); showToast('Cliente actualizado ✓'); render();
  } catch (e) { setSyncError(); showToast('Error al actualizar', 'error'); }
}

function deleteClient(id) {
  const c = data.clients.find(x => x.id === id);
  if (!c) return;
  document.getElementById('confirmBody').innerHTML =
    `¿Eliminar al cliente <span class="confirm-subject">${c.name}</span>? Esta acción no se puede deshacer.`;
  document.getElementById('confirmOkBtn').onclick = async () => {
    closeModal('confirmModal'); setSyncing();
    try {
      await dbDelete('clients', id);
      data.clients = data.clients.filter(x => x.id !== id);
      setSynced(); showToast('Cliente eliminado'); render();
    } catch (e) { setSyncError(); showToast('Error al eliminar', 'error'); }
  };
  openModal('confirmModal');
}

// =============================================
// RENEW CLIENT
// =============================================
function openRenewClient(id) {
  const c = data.clients.find(x => x.id === id);
  if (!c) return;
  document.getElementById('renew-cli-id').value  = id;
  document.getElementById('renewInfo').textContent =
    `Cliente: ${c.name}\nVence actualmente: ${formatDate(c.expiry)}`;
  document.getElementById('renew-expiry').value  = c.expiry || '';
  document.getElementById('renew-payment').value = c.price || '';
  openModal('renewModal');
}

async function confirmRenew() {
  const id     = document.getElementById('renew-cli-id').value;
  const expiry = document.getElementById('renew-expiry').value;
  const payAmt = document.getElementById('renew-payment').value;
  if (!expiry) { showToast('Selecciona una fecha', 'error'); return; }

  setSyncing();
  try {
    await dbUpdate('clients', id, { expiry });
    const c = data.clients.find(x => x.id === id);
    if (c) c.expiry = expiry;

    if (payAmt && parseInt(payAmt) > 0) {
      const pay = {
        id: uid(), type: 'income', amount: parseInt(payAmt),
        description: `Renovación ${c ? c.name : 'cliente'}`,
        related_id: id, payment_date: todayStr()
      };
      await dbInsert('payments', pay);
      data.payments.push(pay);
    }

    closeModal('renewModal');
    setSynced(); showToast('Renovación guardada ✓'); render();
  } catch (e) { setSyncError(); showToast('Error al renovar', 'error'); }
}

// =============================================
// PAYMENTS — manual register
// =============================================
function openPaymentModal(type) {
  document.getElementById('pay-type').value = type;
  const isIncome = type === 'income';
  document.getElementById('paymentModalTitle').childNodes[0].textContent =
    isIncome ? 'Registrar ingreso ' : 'Registrar egreso ';
  document.getElementById('paymentSaveBtn').className =
    isIncome ? 'btn btn-income' : 'btn btn-expense';
  document.getElementById('pay-desc').value   = '';
  document.getElementById('pay-amount').value = '';
  document.getElementById('pay-date').value   = todayStr();
  openModal('paymentModal');
}

async function savePayment() {
  const type         = document.getElementById('pay-type').value;
  const description  = document.getElementById('pay-desc').value.trim();
  const amount       = document.getElementById('pay-amount').value;
  const payment_date = document.getElementById('pay-date').value;
  if (!amount || !payment_date) { showToast('Monto y fecha son obligatorios', 'error'); return; }

  const row = { id: uid(), type, amount: parseInt(amount), description, related_id: null, payment_date };
  setSyncing();
  try {
    await dbInsert('payments', row);
    data.payments.push(row);
    closeModal('paymentModal');
    setSynced(); showToast('Movimiento guardado ✓');
    if (currentPage === 'balance') renderBalance();
  } catch (e) { setSyncError(); showToast('Error: ' + e.message, 'error'); }
}

function deletePayment(id) {
  document.getElementById('confirmBody').innerHTML = '¿Eliminar este movimiento? No se puede deshacer.';
  document.getElementById('confirmOkBtn').onclick = async () => {
    closeModal('confirmModal'); setSyncing();
    try {
      await dbDelete('payments', id);
      data.payments = data.payments.filter(p => p.id !== id);
      setSynced(); showToast('Movimiento eliminado');
      if (currentPage === 'balance') renderBalance();
    } catch (e) { setSyncError(); showToast('Error al eliminar', 'error'); }
  };
  openModal('confirmModal');
}

// =============================================
// SELECT ACCOUNT (cuentas panel)
// =============================================
function selectAccount(id) {
  selectedAccountId = selectedAccountId === id ? null : id;
  if (window.innerWidth <= 700 && selectedAccountId) {
    document.querySelectorAll('[data-tab]').forEach(p => p.classList.remove('tab-active'));
    document.querySelector('[data-tab="clients"]').classList.add('tab-active');
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-btn')[1].classList.add('active');
  }
  render();
}

// =============================================
// RENDER — CUENTAS
// =============================================
function render() {
  renderStats();
  renderAlerts();
  renderAccounts();
  renderRightPanel();
}

function renderStats() {
  document.getElementById('statAccounts').textContent =
    data.accounts.filter(a => daysLeft(a.expiry) >= 0).length;
  document.getElementById('statClients').textContent = data.clients.length;

  const warn = [...data.accounts, ...data.clients]
    .filter(x => { const d = daysLeft(x.expiry); return d >= 0 && d <= 7; }).length;
  const exp  = [...data.accounts, ...data.clients]
    .filter(x => daysLeft(x.expiry) < 0).length;

  document.getElementById('statWarning').textContent = warn;
  document.getElementById('statExpired').textContent = exp;
  document.getElementById('accountCount').textContent = data.accounts.length;
  document.getElementById('clientCount').textContent  = data.clients.length;
}

function renderAlerts() {
  const chips = [];
  [...data.accounts, ...data.clients].forEach(x => {
    const d    = daysLeft(x.expiry);
    const name = x.email ? x.email.split('@')[0] : x.name;
    if (d !== null && d >= 0 && d <= 7) chips.push({ type: 'warn',   text: `${name} vence en ${d}d` });
    if (d !== null && d < 0)            chips.push({ type: 'danger', text: `${name} VENCIDO` });
  });
  const sec = document.getElementById('alertsSection');
  if (!chips.length) { sec.style.display = 'none'; return; }
  sec.style.display = 'flex';
  document.getElementById('alertChips').innerHTML = chips
    .map(c => `<span class="alert-chip ${c.type}">${c.type === 'danger' ? '🔴' : '⚠️'} ${c.text}</span>`)
    .join('');
}

function renderAccounts() {
  const list = document.getElementById('accountList');
  if (!data.accounts.length) {
    list.innerHTML = `<div class="empty-state"><div class="empty-icon">📺</div><div>No hay cuentas registradas</div><div style="margin-top:8px">Haz clic en "+ Cuenta" para agregar</div></div>`;
    return;
  }
  list.innerHTML = data.accounts.map(a => {
    const days = daysLeft(a.expiry);
    const sc   = statusColor(days);
    const cli  = data.clients.filter(c => c.account_id === a.id).length;
    const sel  = selectedAccountId === a.id ? 'selected' : '';
    const cc   = sc === 'yellow' ? 'warning' : sc === 'red' ? 'expired' : '';
    return `
    <div class="account-card ${cc} ${sel}" onclick="selectAccount('${a.id}')">
      <div class="card-top">
        <div>
          <div class="card-email">${a.email}</div>
          <div class="card-meta">🔑 ${a.password || '—'} · ${a.slots || 4} perfiles${a.cost ? ' · Costo: ' + formatCOP(a.cost) : ''}</div>
        </div>
        <div class="card-actions">
          <button class="btn btn-ghost btn-sm" onclick="event.stopPropagation();openEditAccount('${a.id}')">✏️</button>
          <button class="btn btn-ghost btn-sm" onclick="event.stopPropagation();deleteAccount('${a.id}')">✕</button>
        </div>
      </div>
      <div class="card-bottom">
        <span class="pill pill-${sc}">Vence: ${formatDate(a.expiry)}</span>
        <span class="pill pill-muted">${cli} clientes</span>
        ${days !== null ? `<span class="pill pill-${sc}">${daysLabel(days)}</span>` : ''}
        ${a.notes ? `<span class="pill pill-muted" title="${a.notes}">📝</span>` : ''}
      </div>
    </div>`;
  }).join('');
}

function renderRightPanel() {
  const title   = document.getElementById('rightPanelTitle');
  const content = document.getElementById('rightPanelContent');
  const badge   = document.getElementById('clientCount');

  if (!selectedAccountId) {
    title.textContent  = 'Todos los clientes';
    badge.textContent  = data.clients.length;
    if (!data.clients.length) {
      content.innerHTML = `<div class="empty-state" style="margin-top:3rem"><div class="empty-icon">👥</div><div>No hay clientes aún</div><div style="margin-top:8px">Agrega con "+ Cliente"</div></div>`;
      return;
    }
    content.innerHTML = `<div class="card-list">${data.clients.map(c => renderClientCard(c)).join('')}</div>`;
    return;
  }

  const acc     = data.accounts.find(a => a.id === selectedAccountId);
  if (!acc) return;
  const clients = data.clients.filter(c => c.account_id === selectedAccountId);
  badge.textContent  = clients.length;
  title.textContent  = acc.email.split('@')[0];

  const ad  = daysLeft(acc.expiry);
  const asc = statusColor(ad);

  content.innerHTML = `
  <div class="detail-view">
    <div class="detail-header">
      <div class="detail-email">${acc.email}</div>
      <div style="font-size:0.65rem;color:var(--muted);margin-top:3px">
        🔑 ${acc.password || '—'} · ${acc.slots || 4} perfiles${acc.cost ? ' · Costo: ' + formatCOP(acc.cost) : ''}
      </div>
      ${acc.notes ? `<div style="font-size:0.65rem;color:var(--muted);margin-top:3px">📝 ${acc.notes}</div>` : ''}
    </div>
    <div class="detail-dates">
      <div class="date-box">
        <div class="date-box-label">Vencimiento cuenta</div>
        <div class="date-box-value" style="color:var(--${asc === 'green' ? 'text' : asc})">${formatDate(acc.expiry)}</div>
        <div class="date-box-days" style="color:var(--${asc})">${daysLabel(ad)}</div>
      </div>
      <div class="date-box">
        <div class="date-box-label">Clientes activos</div>
        <div class="date-box-value">${clients.filter(c => daysLeft(c.expiry) >= 0).length} / ${acc.slots || 4}</div>
        <div class="date-box-days" style="color:var(--muted)">perfiles usados</div>
      </div>
    </div>
    <div>
      <div class="clients-in-label">
        <span>Clientes en esta cuenta</span>
        <button class="btn btn-ghost btn-sm" onclick="openModal('clientModal')">+ Agregar</button>
      </div>
      ${!clients.length
        ? `<div class="empty-state" style="padding:2rem"><div class="empty-icon">👤</div><div>Sin clientes asignados</div></div>`
        : clients.map(c => renderClientCard(c)).join('')}
    </div>
  </div>`;
}

function renderClientCard(c) {
  const days = daysLeft(c.expiry);
  const sc   = statusColor(days);
  const acc  = c.account_id ? data.accounts.find(a => a.id === c.account_id) : null;
  return `
  <div class="client-card">
    <div class="client-top">
      <div>
        <div class="client-name">${c.name}</div>
        <div class="client-info">
          ${c.phone   ? '📱 ' + c.phone  : ''}
          ${c.profile ? '· 👤 ' + c.profile : ''}
          ${c.price   ? '· ' + formatCOP(c.price) : ''}
        </div>
        ${!selectedAccountId && acc
          ? `<div class="client-info" style="margin-top:2px">📺 ${acc.email}</div>` : ''}
      </div>
      <span class="pill pill-${sc}">${formatDate(c.expiry)}</span>
    </div>
    <div class="client-bottom">
      <span class="pill pill-${sc}">${daysLabel(days)}</span>
      <div class="client-actions">
        <button class="btn btn-success btn-sm" onclick="openRenewClient('${c.id}')">Renovar</button>
        <button class="btn btn-ghost btn-sm"   onclick="openEditClient('${c.id}')">Editar</button>
        <button class="btn btn-danger btn-sm"  onclick="deleteClient('${c.id}')">✕</button>
      </div>
    </div>
  </div>`;
}

// =============================================
// RENDER — BALANCE
// =============================================
function switchBalanceView(view) {
  balanceView = view;
  document.getElementById('viewBtnYear').classList.toggle('active',  view === 'year');
  document.getElementById('viewBtnMonth').classList.toggle('active', view === 'month');
  document.getElementById('monthFilter').style.display = view === 'month' ? '' : 'none';
  renderBalance();
}

function buildYearOptions() {
  const years = new Set();
  const now   = new Date().getFullYear();
  for (let i = 0; i < 3; i++) years.add(String(now - i));
  data.payments.forEach(p => { if (p.payment_date) years.add(yearKey(p.payment_date)); });
  const sorted = [...years].sort().reverse();
  const sel = document.getElementById('yearFilter');
  const cur = sel.value;
  sel.innerHTML = sorted.map(y => `<option value="${y}">${y}</option>`).join('');
  if (cur && sorted.includes(cur)) sel.value = cur;
  else sel.value = sorted[0] || String(now);
}

function buildMonthOptions(year) {
  const months  = [];
  const present = new Set(
    data.payments
      .filter(p => yearKey(p.payment_date) === year)
      .map(p => monthKey(p.payment_date))
  );
  for (let m = 1; m <= 12; m++) {
    const ym = `${year}-${String(m).padStart(2, '0')}`;
    months.push(ym);
  }
  const sel = document.getElementById('monthFilter');
  const cur = sel.value;
  sel.innerHTML = months.map(ym =>
    `<option value="${ym}">${monthLabel(ym)}${present.has(ym) ? '' : ''}</option>`
  ).join('');
  // Default to current month in selected year
  const nowYM = new Date().toISOString().slice(0, 7);
  if (cur && months.includes(cur)) sel.value = cur;
  else if (months.includes(nowYM)) sel.value = nowYM;
  else sel.value = months[11];
}

function renderBalance() {
  buildYearOptions();
  const year = document.getElementById('yearFilter').value;
  buildMonthOptions(year);

  let filteredPays;
  let subtitle;

  if (balanceView === 'year') {
    filteredPays = data.payments.filter(p => yearKey(p.payment_date) === year);
    subtitle     = `Resumen del año ${year}`;
    document.getElementById('chartTitle').textContent   = `Evolución mensual ${year}`;
    document.getElementById('kpiAvgLabel').textContent  = 'Promedio mensual';
    document.getElementById('balAvgSub').textContent    = 'ganancia/mes';
  } else {
    const ym     = document.getElementById('monthFilter').value;
    filteredPays = data.payments.filter(p => monthKey(p.payment_date) === ym);
    subtitle     = `Detalle de ${monthLabel(ym)}`;
    document.getElementById('chartTitle').textContent  = `Movimientos de ${monthLabel(ym)}`;
    document.getElementById('kpiAvgLabel').textContent = 'Días con movim.';
    document.getElementById('balAvgSub').textContent   = 'en el mes';
  }

  document.getElementById('balanceSubtitle').textContent = subtitle;

  const income  = filteredPays.filter(p => p.type === 'income').reduce((s, p) => s + Number(p.amount), 0);
  const expense = filteredPays.filter(p => p.type === 'expense').reduce((s, p) => s + Number(p.amount), 0);
  const profit  = income - expense;
  const margin  = income > 0 ? Math.round((profit / income) * 100) : 0;

  // KPI income
  document.getElementById('balIncome').textContent    = formatCOP(income);
  document.getElementById('balIncomeSub').textContent =
    `${filteredPays.filter(p => p.type === 'income').length} pagos recibidos`;

  // KPI expense
  document.getElementById('balExpense').textContent    = formatCOP(expense);
  document.getElementById('balExpenseSub').textContent =
    `${filteredPays.filter(p => p.type === 'expense').length} pagos realizados`;

  // KPI profit
  const profEl = document.getElementById('balProfit');
  profEl.textContent = formatCOP(Math.abs(profit));
  profEl.className   = 'kpi-value ' + (profit >= 0 ? 'profit-pos' : 'profit-neg');
  document.getElementById('balProfitSub').textContent =
    `${profit >= 0 ? 'Ganancia' : 'Pérdida'} · ${margin}% margen`;

  // KPI avg
  if (balanceView === 'year') {
    const monthsWithData = new Set(filteredPays.map(p => monthKey(p.payment_date))).size || 1;
    document.getElementById('balAvg').textContent = formatCOPShort(Math.round(profit / monthsWithData));
  } else {
    const days = new Set(filteredPays.map(p => p.payment_date)).size;
    document.getElementById('balAvg').textContent = String(days);
  }

  // Breakdown sidebar
  document.getElementById('bsIncome').textContent  = formatCOP(income);
  document.getElementById('bsExpense').textContent = formatCOP(expense);
  const bsProfit = document.getElementById('bsProfit');
  bsProfit.textContent = formatCOP(Math.abs(profit));
  bsProfit.className   = 'bs-val ' + (profit >= 0 ? 'green' : 'red');
  document.getElementById('donutPct').textContent = `${margin}%`;

  renderMainChart(year, filteredPays);
  renderDonutChart(income, expense);
  renderPaymentsList(filteredPays);
  document.getElementById('paymentsCount').textContent = filteredPays.length;
}

// =============================================
// MAIN CHART
// =============================================
function renderMainChart(year, filteredPays) {
  const ctx = document.getElementById('mainChart').getContext('2d');
  if (mainChartInstance) mainChartInstance.destroy();

  let labels, incomes, expenses, profits;

  if (balanceView === 'year') {
    // 12 months of the year
    labels   = [];
    incomes  = [];
    expenses = [];
    profits  = [];
    const names = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
    for (let m = 1; m <= 12; m++) {
      const ym = `${year}-${String(m).padStart(2, '0')}`;
      const mp = data.payments.filter(p => monthKey(p.payment_date) === ym);
      const inc = mp.filter(p => p.type === 'income').reduce((s, p) => s + Number(p.amount), 0);
      const exp = mp.filter(p => p.type === 'expense').reduce((s, p) => s + Number(p.amount), 0);
      labels.push(names[m - 1]);
      incomes.push(inc);
      expenses.push(exp);
      profits.push(inc - exp);
    }
  } else {
    // Daily breakdown within selected month
    const ym       = document.getElementById('monthFilter').value;
    const [y, mo]  = ym.split('-').map(Number);
    const daysInM  = new Date(y, mo, 0).getDate();
    labels   = [];
    incomes  = [];
    expenses = [];
    profits  = [];
    for (let d = 1; d <= daysInM; d++) {
      const ds  = `${y}-${String(mo).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
      const dp  = data.payments.filter(p => p.payment_date === ds);
      const inc = dp.filter(p => p.type === 'income').reduce((s, p) => s + Number(p.amount), 0);
      const exp = dp.filter(p => p.type === 'expense').reduce((s, p) => s + Number(p.amount), 0);
      labels.push(String(d));
      incomes.push(inc);
      expenses.push(exp);
      profits.push(inc - exp);
    }
  }

  mainChartInstance = new Chart(ctx, {
    data: {
      labels,
      datasets: [
        {
          type: 'bar',
          label: 'Ingresos',
          data: incomes,
          backgroundColor: 'rgba(34,197,94,0.55)',
          borderColor: '#22c55e',
          borderWidth: 1,
          borderRadius: 4,
          order: 2
        },
        {
          type: 'bar',
          label: 'Egresos',
          data: expenses,
          backgroundColor: 'rgba(239,68,68,0.55)',
          borderColor: '#ef4444',
          borderWidth: 1,
          borderRadius: 4,
          order: 2
        },
        {
          type: 'line',
          label: 'Ganancia',
          data: profits,
          borderColor: '#e50914',
          backgroundColor: 'rgba(229,9,20,0.08)',
          borderWidth: 2,
          pointBackgroundColor: '#e50914',
          pointRadius: 3,
          pointHoverRadius: 5,
          fill: true,
          tension: 0.4,
          order: 1
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#18181f',
          borderColor: '#2a2a35',
          borderWidth: 1,
          titleColor: '#f0f0f5',
          bodyColor: '#6b6b80',
          padding: 10,
          callbacks: {
            label: ctx => `${ctx.dataset.label}: ${formatCOP(ctx.raw)}`
          }
        }
      },
      scales: {
        x: {
          ticks: { color: '#6b6b80', font: { family: 'DM Mono', size: 10 } },
          grid: { color: '#2a2a35' }
        },
        y: {
          ticks: {
            color: '#6b6b80',
            font: { family: 'DM Mono', size: 10 },
            callback: v => formatCOPShort(v)
          },
          grid: { color: '#2a2a35' }
        }
      }
    }
  });
}

// =============================================
// DONUT CHART
// =============================================
function renderDonutChart(income, expense) {
  const ctx = document.getElementById('donutChart').getContext('2d');
  if (donutChartInstance) donutChartInstance.destroy();

  const hasData = income > 0 || expense > 0;
  donutChartInstance = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: ['Ingresos', 'Egresos'],
      datasets: [{
        data: hasData ? [income, expense] : [1, 1],
        backgroundColor: hasData
          ? ['rgba(34,197,94,0.7)', 'rgba(239,68,68,0.7)']
          : ['#2a2a35', '#2a2a35'],
        borderColor: hasData
          ? ['#22c55e', '#ef4444']
          : ['#2a2a35', '#2a2a35'],
        borderWidth: 2,
        hoverOffset: 4
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '70%',
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#18181f',
          borderColor: '#2a2a35',
          borderWidth: 1,
          titleColor: '#f0f0f5',
          bodyColor: '#6b6b80',
          callbacks: {
            label: ctx => ` ${ctx.label}: ${formatCOP(ctx.raw)}`
          }
        }
      }
    }
  });
}

// =============================================
// PAYMENTS LIST
// =============================================
function renderPaymentsList(pays) {
  const el = document.getElementById('paymentsList');
  if (!pays.length) {
    el.innerHTML = `<div class="payments-empty">Sin movimientos en este período</div>`;
    return;
  }
  const sorted = [...pays].sort((a, b) => b.payment_date.localeCompare(a.payment_date));
  el.innerHTML = sorted.map(p => `
    <div class="payment-row">
      <div class="payment-date">${formatDate(p.payment_date)}</div>
      <div class="payment-desc">
        ${p.description || '—'}
        <small>${p.type === 'income' ? '↑ Ingreso' : '↓ Egreso'}</small>
      </div>
      <div class="payment-amount ${p.type === 'income' ? 'inc' : 'exp'}">
        ${p.type === 'income' ? '+' : '-'}${formatCOP(p.amount)}
      </div>
      <button class="payment-del" onclick="deletePayment('${p.id}')" title="Eliminar">✕</button>
    </div>`).join('');
}

// =============================================
// INIT
// =============================================
async function init() {
  try {
    const [accounts, clients, payments] = await Promise.all([
      dbGet('accounts'),
      dbGet('clients'),
      dbGet('payments')
    ]);
    data = { accounts, clients, payments };
    setSynced();
    render();
  } catch (e) {
    setSyncError();
    showToast('No se pudo conectar a Supabase', 'error');
    console.error(e);
  } finally {
    document.getElementById('loadingOverlay').style.display = 'none';
  }
}

init();
