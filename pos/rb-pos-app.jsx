import React, { useState, useEffect, useRef } from 'react';
import Papa from 'papaparse';
import {
  ShoppingCart, FileText, RotateCcw, Boxes, Wallet,
  Settings as SettingsIcon, Package, Tag, Truck, Printer, Users, Receipt,
} from 'lucide-react';

const GREEN = '#1f3327';
const GREEN_MID = '#2f4a38';
const PARCHMENT = '#f3eee2';
const WHEAT = '#c9a227';
const RUST = '#8a3b28';
const CHARCOAL = '#211f1c';
const OK = '#3d6b45';
const WARN = '#b3401f';
const LINE = 'rgba(31,51,39,0.14)';

const STORAGE_KEY = 'rb-pos-data-v4';

const SEED_PRODUCTS = [
  { id: 'p1', name: 'Heptavac P Plus, 250ml', code: 'AH-1029', barcode: '5012345678900', category: 'POM-VPS', price: 68.0 },
  { id: 'p2', name: 'Combinex, 5L', code: 'AH-0847', barcode: '5012345678917', category: 'NFA-VPS', price: 58.0 },
  { id: 'p3', name: 'Footvax, 20-dose', code: 'AH-1103', barcode: '5012345678924', category: 'POM-VPS', price: 74.0 },
  { id: 'p4', name: 'Baler twine, 130m', code: 'GEN-0201', barcode: '5012345678931', category: 'General', price: 12.5 },
  { id: 'p5', name: 'Fencing wire, roll', code: 'GEN-0340', barcode: '5012345678948', category: 'General', price: 28.5 },
];

const SEED_CUSTOMERS = [
  { id: 'c1', name: 'Bryn Hafod Farm — R. Pugh', location: 'Llanfair Caereinion' },
  { id: 'c2', name: 'Cefn Coch — Davies', location: 'Newtown' },
  { id: 'c3', name: 'Ty Gwyn — Jones', location: 'Llanidloes' },
];

const SEED_STAFF = [
  { id: 's1', name: 'Trade Counter', pin: '1234' },
  { id: 's2', name: 'Lucy', pin: '001' },
  { id: 's3', name: 'Fiona', pin: '007' },
];

function uid(prefix) {
  return prefix + '_' + Math.random().toString(36).slice(2, 9);
}
function todayISO() {
  return new Date().toISOString().slice(0, 10);
}
function fmtMoney(n) {
  return '£' + Number(n).toFixed(2);
}

// --- duplicate / similar-product detection ---
function levenshtein(a, b) {
  const m = a.length, n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  return dp[m][n];
}
function nameSimilarity(a, b) {
  const x = (a || '').trim().toLowerCase();
  const y = (b || '').trim().toLowerCase();
  if (!x || !y) return 0;
  if (x === y) return 1;
  const dist = levenshtein(x, y);
  return 1 - dist / Math.max(x.length, y.length);
}
const SIMILARITY_THRESHOLD = 0.82;
// Checks a candidate product against an existing catalogue. Returns null if it looks like
// a genuinely new product, or { product, score, reason } if it needs a human decision.
function findBestMatch(catalogue, candidate) {
  let best = null;
  let bestScore = 0;
  for (const p of catalogue) {
    if (candidate.barcode && p.barcode && candidate.barcode.trim() === p.barcode.trim()) {
      return { product: p, score: 1, reason: 'exact-barcode' };
    }
    if (candidate.code && p.code && candidate.code.trim().toLowerCase() === p.code.trim().toLowerCase()) {
      return { product: p, score: 1, reason: 'exact-code' };
    }
    const score = nameSimilarity(candidate.name, p.name);
    if (score > bestScore) { bestScore = score; best = p; }
  }
  if (!best) return null;
  if (bestScore >= 1) return { product: best, score: bestScore, reason: 'exact-name' };
  if (bestScore >= SIMILARITY_THRESHOLD) return { product: best, score: bestScore, reason: 'similar-name' };
  return null;
}

export default function RBPos() {
  const [tab, setTab] = useState('home');
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);

  const [products, setProducts] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [staffList, setStaffList] = useState([]);
  const [currentStaff, setCurrentStaff] = useState('');
  const [stockBatches, setStockBatches] = useState([]);
  const [payments, setPayments] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [returns, setReturns] = useState([]);
  const [corrections, setCorrections] = useState([]);
  const [printedCorrectionIds, setPrintedCorrectionIds] = useState([]);
  const [lockAfterMinutes, setLockAfterMinutes] = useState(2);
  const [locked, setLocked] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await window.storage.get(STORAGE_KEY, false);
        if (res && res.value) {
          const data = JSON.parse(res.value);
          const storedStaff = data.staffList || [];
          const missingSeedStaff = SEED_STAFF.filter((seed) => !storedStaff.some((s) => s.pin === seed.pin));
          setProducts(data.products || SEED_PRODUCTS);
          setCustomers(data.customers || SEED_CUSTOMERS);
          setStaffList(storedStaff.length ? [...storedStaff, ...missingSeedStaff] : SEED_STAFF);
          setCurrentStaff(data.currentStaff || SEED_STAFF[0].name);
          setStockBatches(data.stockBatches || []);
          setPayments(data.payments || []);
          setTransactions(data.transactions || []);
          setReturns(data.returns || []);
          setCorrections(data.corrections || []);
          setPrintedCorrectionIds(data.printedCorrectionIds || []);
          setLockAfterMinutes(data.lockAfterMinutes || 2);
        } else {
          setProducts(SEED_PRODUCTS);
          setCustomers(SEED_CUSTOMERS);
          setStaffList(SEED_STAFF);
          setCurrentStaff(SEED_STAFF[0].name);
          setStockBatches([
            { id: uid('b'), productId: 'p1', batch: 'HP4471', qty: 6, expiry: '2027-06-30', received: todayISO() },
            { id: uid('b'), productId: 'p1', batch: 'HP4502', qty: 4, expiry: '2027-08-15', received: todayISO() },
            { id: uid('b'), productId: 'p2', batch: 'CX2298', qty: 12, expiry: '2028-01-15', received: todayISO() },
            { id: uid('b'), productId: 'p3', batch: 'FV1187', qty: 6, expiry: '2027-11-01', received: todayISO() },
            { id: uid('b'), productId: 'p4', batch: '—', qty: 40, expiry: '', received: todayISO() },
            { id: uid('b'), productId: 'p5', batch: '—', qty: 15, expiry: '', received: todayISO() },
          ]);
        }
      } catch (e) {
        console.error('load failed', e);
        setProducts(SEED_PRODUCTS);
        setCustomers(SEED_CUSTOMERS);
        setStaffList(SEED_STAFF);
        setCurrentStaff(SEED_STAFF[0].name);
      }
      setLoaded(true);
    })();
  }, []);

  useEffect(() => {
    if (!loaded) return;
    (async () => {
      setSaving(true);
      try {
        await window.storage.set(
          STORAGE_KEY,
          JSON.stringify({ products, customers, staffList, currentStaff, stockBatches, payments, transactions, returns, corrections, printedCorrectionIds, lockAfterMinutes }),
          false
        );
      } catch (e) {
        console.error('save failed', e);
      }
      setSaving(false);
    })();
  }, [products, customers, staffList, currentStaff, stockBatches, payments, transactions, returns, corrections, printedCorrectionIds, lockAfterMinutes, loaded]);

  // Inactivity lock: any interaction resets the timer; letting it run out shows the PIN screen.
  useEffect(() => {
    if (!loaded) return;
    let timer;
    function resetTimer() {
      clearTimeout(timer);
      timer = setTimeout(() => setLocked(true), lockAfterMinutes * 60000);
    }
    const events = ['mousemove', 'keydown', 'click', 'touchstart'];
    events.forEach((ev) => window.addEventListener(ev, resetTimer));
    resetTimer();
    return () => {
      clearTimeout(timer);
      events.forEach((ev) => window.removeEventListener(ev, resetTimer));
    };
  }, [loaded, lockAfterMinutes]);

  function stockFor(productId) {
    return stockBatches.filter((b) => b.productId === productId).reduce((s, b) => s + b.qty, 0);
  }

  function receiveStock({ productId, batch, qty, expiry }) {
    setStockBatches((prev) => [...prev, { id: uid('b'), productId, batch: batch || '—', qty, expiry, received: todayISO(), receivedBy: currentStaff }]);
  }

  function deductStock(productId, qtyNeeded) {
    let remaining = qtyNeeded;
    const consumed = [];
    setStockBatches((prev) => {
      const sorted = [...prev].sort((a, b) => (a.expiry || '9999').localeCompare(b.expiry || '9999'));
      return sorted.map((b) => {
        if (b.productId !== productId || remaining <= 0) return b;
        const take = Math.min(b.qty, remaining);
        if (take > 0) {
          consumed.push({ batch: b.batch, qty: take });
          remaining -= take;
          return { ...b, qty: b.qty - take };
        }
        return b;
      });
    });
    return consumed;
  }

  function recordSale({ customerId, items, method }) {
    const total = items.reduce((s, it) => s + it.qty * it.price, 0);
    const lineDetails = items.map((it) => ({ ...it, consumed: deductStock(it.productId, it.qty) }));
    const tx = { id: uid('tx'), date: todayISO(), customerId, items: lineDetails, total, method, staff: currentStaff };
    setTransactions((prev) => [tx, ...prev]);
    return tx;
  }

  // Balance is always derived from the ledger — sum of account sales minus sum of payments —
  // never stored as its own number, so it can't drift out of sync with the history behind it.
  function getBalance(customerId) {
    const charged = transactions
      .filter((t) => t.customerId === customerId && t.method === 'account')
      .reduce((s, t) => s + t.total, 0);
    const paid = payments
      .filter((p) => p.customerId === customerId)
      .reduce((s, p) => s + p.amount, 0);
    return charged - paid;
  }

  function recordPayment({ customerId, amount, method, note }) {
    const payment = { id: uid('pm'), date: todayISO(), customerId, amount, method, note: note || '', staff: currentStaff };
    setPayments((prev) => [payment, ...prev]);
    return payment;
  }

  function alreadyReturnedQty(txId, productId) {
    return returns.filter((r) => r.txId === txId && r.productId === productId).reduce((s, r) => s + r.qty, 0);
  }

  // Restocks against the exact batches the item was originally sold from (oldest-first order
  // preserved from the sale), rather than a generic pile — keeps the traceability intact.
  function allocateReturnBatches(consumed, qtyToReturn) {
    let remaining = qtyToReturn;
    const out = [];
    for (const c of consumed || []) {
      if (remaining <= 0) break;
      const take = Math.min(c.qty, remaining);
      if (take > 0) { out.push({ batch: c.batch, qty: take }); remaining -= take; }
    }
    return out;
  }

  function processReturn({ tx, item, qty, restock, reason }) {
    const refundAmount = qty * item.price;
    if (restock) {
      const batches = allocateReturnBatches(item.consumed, qty);
      batches.forEach((b) => {
        setStockBatches((prev) => {
          const idx = prev.findIndex((sb) => sb.productId === item.productId && sb.batch === b.batch);
          if (idx >= 0) {
            const copy = [...prev];
            copy[idx] = { ...copy[idx], qty: copy[idx].qty + b.qty };
            return copy;
          }
          return [...prev, { id: uid('b'), productId: item.productId, batch: b.batch, qty: b.qty, expiry: '', received: todayISO() }];
        });
      });
    }
    if (tx.method === 'account') {
      recordPayment({ customerId: tx.customerId, amount: refundAmount, method: 'return credit', note: item.name });
    }
    const returnRecord = {
      id: uid('rt'), date: todayISO(), txId: tx.id, customerId: tx.customerId,
      productId: item.productId, productName: item.name, qty, refundAmount,
      originalMethod: tx.method, restocked: restock, reason,
    };
    setReturns((prev) => [returnRecord, ...prev]);
    return returnRecord;
  }

  function addProduct(p) {
    setProducts((prev) => [...prev, { id: uid('p'), ...p }]);
  }

  function importProducts(rows) {
    const added = rows
      .filter((r) => r.name && String(r.name).trim())
      .map((r) => ({
        id: uid('p'),
        name: String(r.name).trim(),
        code: String(r.code || '').trim(),
        barcode: String(r.barcode || '').trim(),
        category: String(r.category || 'General').trim(),
        price: parseFloat(r.price) || 0,
      }));
    setProducts((prev) => [...prev, ...added]);
    return added.length;
  }

  // Corrections are logged, not silent — an overwritten batch qty or product price with no
  // record of who changed it or why is exactly the kind of gap that fails an audit later.
  function logCorrection({ entity, entityId, entityLabel, changes, reason }) {
    setCorrections((prev) => [
      { id: uid('cr'), date: todayISO(), staff: currentStaff, entity, entityId, entityLabel, changes, reason: reason || '' },
      ...prev,
    ]);
  }

  function editProduct(productId, updates, reason) {
    const existing = products.find((p) => p.id === productId);
    if (!existing) return;
    const changes = Object.keys(updates)
      .filter((k) => String(existing[k]) !== String(updates[k]))
      .map((k) => ({ field: k, from: existing[k], to: updates[k] }));
    if (changes.length === 0) return;
    setProducts((prev) => prev.map((p) => (p.id === productId ? { ...p, ...updates } : p)));
    logCorrection({ entity: 'product', entityId: productId, entityLabel: existing.name, changes, reason });
  }

  function editStockBatch(batchId, updates, reason) {
    const existing = stockBatches.find((b) => b.id === batchId);
    if (!existing) return;
    const changes = Object.keys(updates)
      .filter((k) => String(existing[k]) !== String(updates[k]))
      .map((k) => ({ field: k, from: existing[k], to: updates[k] }));
    if (changes.length === 0) return;
    setStockBatches((prev) => prev.map((b) => (b.id === batchId ? { ...b, ...updates } : b)));
    const product = products.find((p) => p.id === existing.productId);
    logCorrection({ entity: 'stock batch', entityId: batchId, entityLabel: `${product ? product.name : 'Unknown'} — batch ${existing.batch}`, changes, reason });
  }

  function addCustomer(c) {
    const customer = { id: uid('c'), ...c };
    setCustomers((prev) => [...prev, customer]);
    return customer;
  }

  function editCustomer(customerId, updates) {
    setCustomers((prev) => prev.map((c) => (c.id === customerId ? { ...c, ...updates } : c)));
  }

  function addStaffMember(name, pin) {
    const trimmedName = name.trim();
    const trimmedPin = String(pin || '').trim();
    if (!trimmedName || !trimmedPin) return;
    if (staffList.some((s) => s.pin === trimmedPin)) { alert('That employee number is already in use.'); return; }
    const staff = { id: uid('st'), name: trimmedName, pin: trimmedPin };
    setStaffList((prev) => [...prev, staff]);
    setCurrentStaff(trimmedName);
  }

  function tryUnlock(pin) {
    const match = staffList.find((s) => s.pin === String(pin).trim());
    if (!match) return false;
    setCurrentStaff(match.name);
    setLocked(false);
    return true;
  }

  function exportAllData() {
    const payload = { exportedAt: new Date().toISOString(), products, customers, staffList, stockBatches, payments, transactions, returns, corrections };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `rb-pos-backup-${todayISO()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function markLabelsPrinted(correctionIds) {
    setPrintedCorrectionIds((prev) => [...new Set([...prev, ...correctionIds])]);
  }

  const pendingLabelCount = corrections.filter(
    (c) => c.entity === 'product' && c.changes.some((ch) => ch.field === 'price') && !printedCorrectionIds.includes(c.id)
  ).length;

  return (
    <div style={{ fontFamily: 'Inter, sans-serif', background: PARCHMENT, minHeight: '100vh', color: CHARCOAL, fontSize: 14 }}>
      <style>{`@media print { .no-print { display: none !important; } body { background: #fff !important; } }`}</style>

      {locked && <LockScreen tryUnlock={tryUnlock} />}

      <div className="no-print" style={{ background: RUST, color: '#fff', textAlign: 'center', padding: '6px', fontSize: 11, letterSpacing: '0.06em', textTransform: 'uppercase', fontFamily: 'monospace' }}>
        Working prototype — personal build, data stored locally to this artifact
      </div>

      <header className="no-print" style={{ background: GREEN, color: PARCHMENT, padding: '14px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontWeight: 600, fontSize: '1.05rem' }}>
          <div style={{ width: 30, height: 30, borderRadius: '50%', border: `1px solid ${WHEAT}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, color: WHEAT, fontFamily: 'monospace' }}>R&B</div>
          Stock &amp; Accounts
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {tab !== 'home' && (
            <button
              onClick={() => setTab('home')}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                background: 'rgba(243,238,226,0.12)', color: '#fff', border: `1px solid ${WHEAT}`,
                borderRadius: 3, padding: '7px 14px', fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer',
              }}
            >
              ← Home
            </button>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: '0.72rem', color: 'rgba(243,238,226,0.55)' }}>{saving ? 'Saving…' : 'Saved'}</span>
          <button
            onClick={() => setLocked(true)}
            title="Tap to hand over to another staff member"
            style={{
              background: 'rgba(243,238,226,0.12)', color: '#fff', border: `1px solid ${WHEAT}`, borderRadius: 20,
              padding: '5px 12px', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 6,
            }}
          >
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: OK }} />
            {currentStaff}
          </button>
        </div>
      </header>

      <main style={
        tab === 'home'
          ? { padding: '24px 16px', minHeight: 'calc(100vh - 118px)', display: 'flex', flexDirection: 'column' }
          : { maxWidth: 720, margin: '0 auto', padding: '24px 16px 60px' }
      }>
        {!loaded ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#6b6659' }}>Loading…</div>
        ) : tab === 'home' ? (
          <HomeTab setTab={setTab} pendingLabelCount={pendingLabelCount} />
        ) : tab === 'inventory-menu' ? (
          <InventoryMenuTab setTab={setTab} pendingLabelCount={pendingLabelCount} />
        ) : tab === 'accounts-menu' ? (
          <AccountsMenuTab setTab={setTab} />
        ) : tab === 'sales' ? (
          <SalesTab products={products} customers={customers} stockFor={stockFor} recordSale={recordSale} />
        ) : tab === 'quote' ? (
          <QuoteTab products={products} />
        ) : tab === 'goodsin' ? (
          <GoodsInTab products={products} receiveStock={receiveStock} />
        ) : tab === 'returns' ? (
          <ReturnsTab transactions={transactions} customers={customers} returns={returns} alreadyReturnedQty={alreadyReturnedQty} processReturn={processReturn} />
        ) : tab === 'stock' ? (
          <StockTab products={products} stockBatches={stockBatches} editStockBatch={editStockBatch} />
        ) : tab === 'products' ? (
          <ProductsTab products={products} addProduct={addProduct} importProducts={importProducts} editProduct={editProduct} />
        ) : tab === 'labels' ? (
          <LabelsTab products={products} corrections={corrections} printedCorrectionIds={printedCorrectionIds} markLabelsPrinted={markLabelsPrinted} />
        ) : tab === 'customers' ? (
          <CustomersTab customers={customers} addCustomer={addCustomer} editCustomer={editCustomer} getBalance={getBalance} />
        ) : tab === 'accounts' ? (
          <AccountsTab customers={customers} transactions={transactions} payments={payments} returns={returns} getBalance={getBalance} recordPayment={recordPayment} />
        ) : tab === 'billing' ? (
          <BillingTab customers={customers} transactions={transactions} payments={payments} returns={returns} />
        ) : (
          <SettingsTab staffList={staffList} addStaffMember={addStaffMember} corrections={corrections} exportAllData={exportAllData} lockAfterMinutes={lockAfterMinutes} setLockAfterMinutes={setLockAfterMinutes} />
        )}
      </main>
    </div>
  );
}

function Card({ children, style }) {
  return <div style={{ background: '#fff', border: `1px solid ${LINE}`, borderRadius: 4, padding: '18px 20px', marginBottom: 20, ...style }}>{children}</div>;
}
function Label({ children }) {
  return <div style={{ fontFamily: 'monospace', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#8a8577', marginBottom: 8 }}>{children}</div>;
}

const HOME_TILES = [
  { id: 'sales', title: 'Sales', desc: 'Ring up a sale', accent: GREEN, icon: ShoppingCart },
  { id: 'quote', title: 'Quote', desc: 'Price it up, no stock change', accent: RUST, icon: FileText },
  { id: 'returns', title: 'Returns', desc: 'Process a return', accent: GREEN, icon: RotateCcw },
  { id: 'inventory-menu', title: 'Inventory', desc: 'Stock, products, goods in, labels', accent: GREEN, badgeKey: 'labels', icon: Boxes },
  { id: 'accounts-menu', title: 'Accounts', desc: 'Balances, customers, billing', accent: GREEN, icon: Wallet },
  { id: 'settings', title: 'Settings', desc: 'Staff, backup, corrections', accent: GREEN, icon: SettingsIcon },
];

const INVENTORY_TILES = [
  { id: 'stock', title: 'Stock', desc: 'Check what\u2019s on the shelf', accent: GREEN, icon: Package },
  { id: 'products', title: 'Products', desc: 'Catalogue & import', accent: GREEN, icon: Tag },
  { id: 'goodsin', title: 'Goods In', desc: 'Receive a delivery', accent: GREEN, icon: Truck },
  { id: 'labels', title: 'Labels', desc: 'Print price changes', accent: GREEN, badgeKey: 'labels', icon: Printer },
];

const ACCOUNTS_TILES = [
  { id: 'accounts', title: 'Accounts', desc: 'Balances & payments', accent: GREEN, icon: Wallet },
  { id: 'customers', title: 'Customers', desc: 'Add or edit customers', accent: GREEN, icon: Users },
  { id: 'billing', title: 'Billing', desc: 'Monthly statements', accent: GREEN, icon: Receipt },
];

function TileGrid({ tiles, setTab, pendingLabelCount, fill }) {
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: fill ? 'repeat(auto-fit, minmax(220px, 1fr))' : 'repeat(2, 1fr)',
      gridAutoRows: fill ? '1fr' : undefined,
      gap: fill ? 16 : 12,
      flex: fill ? 1 : undefined,
    }}>
      {tiles.map((t) => {
        const badge = t.badgeKey === 'labels' ? pendingLabelCount : 0;
        return (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            style={{
              position: 'relative', textAlign: 'left', cursor: 'pointer',
              background: '#fff', border: `1px solid ${LINE}`, borderRadius: 6,
              padding: fill ? '28px 24px' : '20px 16px', minHeight: fill ? 140 : 96,
              display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
            }}
          >
            {t.icon && <t.icon size={fill ? 26 : 20} strokeWidth={1.75} color={t.accent} style={{ marginBottom: fill ? 18 : 14 }} />}
            <div>
              <div style={{ fontFamily: 'Fraunces, serif', fontWeight: 600, fontSize: fill ? '1.3rem' : '1.05rem', color: CHARCOAL }}>
                {t.title}
                {badge > 0 && (
                  <span style={{ marginLeft: 8, background: WHEAT, color: GREEN, fontFamily: 'monospace', fontSize: '0.65rem', fontWeight: 700, borderRadius: 10, padding: '1px 7px', verticalAlign: 'middle' }}>{badge}</span>
                )}
              </div>
              <div style={{ fontSize: fill ? '0.85rem' : '0.78rem', color: '#6b6659', marginTop: 4 }}>{t.desc}</div>
            </div>
          </button>
        );
      })}
    </div>
  );
}

function HomeTab({ setTab, pendingLabelCount }) {
  return <TileGrid tiles={HOME_TILES} setTab={setTab} pendingLabelCount={pendingLabelCount} fill />;
}

function InventoryMenuTab({ setTab, pendingLabelCount }) {
  return <TileGrid tiles={INVENTORY_TILES} setTab={setTab} pendingLabelCount={pendingLabelCount} />;
}

function AccountsMenuTab({ setTab }) {
  return <TileGrid tiles={ACCOUNTS_TILES} setTab={setTab} pendingLabelCount={0} />;
}

// Type-to-search picker — replaces dropdowns once the catalogue is in the hundreds.
// Also doubles as the barcode-scan target: a scanner just "types" the code fast and
// sends Enter, so an exact barcode match on Enter auto-selects rather than waiting for a click.
function ProductSearch({ products, stockFor, onSelect, placeholder }) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const boxRef = useRef(null);

  const matches =
    query.trim().length > 0
      ? products
          .filter(
            (p) =>
              p.name.toLowerCase().includes(query.toLowerCase()) ||
              p.code.toLowerCase().includes(query.toLowerCase()) ||
              (p.barcode && p.barcode.includes(query.trim()))
          )
          .slice(0, 8)
      : [];

  useEffect(() => {
    function onClickOutside(e) {
      if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  function handleKeyDown(e) {
    if (e.key !== 'Enter') return;
    const exact = products.find((p) => p.barcode && p.barcode === query.trim());
    if (exact) {
      onSelect(exact);
      setQuery('');
      setOpen(false);
    }
  }

  return (
    <div ref={boxRef} style={{ position: 'relative' }}>
      <input
        type="text"
        placeholder={placeholder || 'Search by name, code, or scan a barcode…'}
        value={query}
        onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onKeyDown={handleKeyDown}
        style={{ width: '100%', padding: '10px 12px', border: `1px solid ${LINE}`, borderRadius: 3, background: PARCHMENT, fontSize: '0.9rem' }}
      />
      {open && matches.length > 0 && (
        <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: '#fff', border: `1px solid ${LINE}`, borderRadius: 3, marginTop: 4, zIndex: 10, boxShadow: '0 8px 20px rgba(0,0,0,0.12)', maxHeight: 260, overflowY: 'auto' }}>
          {matches.map((p) => {
            const stock = stockFor ? stockFor(p.id) : null;
            return (
              <div
                key={p.id}
                onClick={() => { onSelect(p); setQuery(''); setOpen(false); }}
                style={{ padding: '9px 12px', cursor: 'pointer', borderBottom: `1px solid ${LINE}`, fontSize: '0.85rem' }}
                onMouseDown={(e) => e.preventDefault()}
              >
                <div style={{ fontWeight: 600 }}>{p.name}</div>
                <div style={{ fontSize: '0.72rem', color: '#8a8577', fontFamily: 'monospace' }}>
                  {p.code} · {fmtMoney(p.price)}{stock !== null ? ` · ${stock} in stock` : ''}
                </div>
              </div>
            );
          })}
        </div>
      )}
      {open && query.trim().length > 0 && matches.length === 0 && (
        <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: '#fff', border: `1px solid ${LINE}`, borderRadius: 3, marginTop: 4, padding: '10px 12px', fontSize: '0.82rem', color: '#8a8577' }}>
          No products match "{query}" — add it in the Products tab.
        </div>
      )}
    </div>
  );
}

function SalesTab({ products, customers, stockFor, recordSale }) {
  const [customerId, setCustomerId] = useState(customers[0].id);
  const [cart, setCart] = useState([]);
  const [receipt, setReceipt] = useState(null);

  const customer = customers.find((c) => c.id === customerId);
  const total = cart.reduce((s, it) => s + it.qty * it.price, 0);

  function handleSelect(p) {
    const available = stockFor(p.id);
    if (available <= 0) {
      alert(`${p.name} is out of stock.`);
      return;
    }
    const existing = cart.find((it) => it.productId === p.id);
    if (existing) {
      if (existing.qty + 1 > available) {
        alert(`Only ${available} in stock for ${p.name}.`);
        return;
      }
      setCart(cart.map((it) => (it.productId === p.id ? { ...it, qty: it.qty + 1 } : it)));
    } else {
      setCart([...cart, { productId: p.id, name: p.name, price: p.price, qty: 1 }]);
    }
  }

  function setQty(productId, qty) {
    const available = stockFor(productId);
    const q = Math.max(1, Math.min(Number(qty) || 1, available));
    setCart(cart.map((it) => (it.productId === productId ? { ...it, qty: q } : it)));
  }

  function bumpQty(productId, delta) {
    const item = cart.find((it) => it.productId === productId);
    if (!item) return;
    setQty(productId, item.qty + delta);
  }

  function removeFromCart(productId) {
    setCart(cart.filter((it) => it.productId !== productId));
  }

  function checkout(method) {
    if (cart.length === 0) { alert('Add at least one item first.'); return; }
    const tx = recordSale({ customerId, items: cart, method });
    setReceipt(tx);
    setCart([]);
  }

  if (receipt) {
    return (
      <Card>
        <div style={{ fontFamily: 'Fraunces, serif', fontSize: '1.3rem', color: GREEN, marginBottom: 6 }}>Sale recorded</div>
        <div style={{ color: '#6b6659', fontSize: '0.88rem', marginBottom: 16 }}>
          {fmtMoney(receipt.total)} — {receipt.method === 'account' ? `booked to ${customer.name}'s account` : 'settled by cash / cheque'}
        </div>
        {receipt.items.map((it, i) => (
          <div key={i} style={{ fontSize: '0.82rem', padding: '6px 0', borderTop: i === 0 ? 'none' : `1px solid ${LINE}` }}>
            <div style={{ fontWeight: 600 }}>{it.name} × {it.qty}</div>
            <div style={{ fontFamily: 'monospace', fontSize: '0.72rem', color: '#8a8577' }}>
              from batch{it.consumed.length > 1 ? 'es' : ''}: {it.consumed.map((c) => `${c.batch} (${c.qty})`).join(', ')}
            </div>
          </div>
        ))}
        <button onClick={() => setReceipt(null)} style={{ marginTop: 16, background: GREEN, color: PARCHMENT, border: 'none', padding: '10px 18px', borderRadius: 3, fontWeight: 600, cursor: 'pointer' }}>
          New sale
        </button>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <Label>Customer</Label>
        <select value={customerId} onChange={(e) => setCustomerId(e.target.value)} style={{ width: '100%', padding: '9px 10px', border: `1px solid ${LINE}`, borderRadius: 3, background: PARCHMENT, fontSize: '0.9rem' }}>
          {customers.map((c) => <option key={c.id} value={c.id}>{c.name} — {c.location}</option>)}
        </select>
      </Card>

      <Card style={{ overflow: 'visible' }}>
        <Label>Add item ({products.length} products in catalogue)</Label>
        <ProductSearch products={products} stockFor={stockFor} onSelect={handleSelect} />
      </Card>

      {cart.length > 0 && (
        <Card>
          {cart.map((it) => (
            <div key={it.productId} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: `1px solid ${LINE}`, gap: 10 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{it.name}</div>
                <div style={{ fontSize: '0.76rem', color: '#6b6659' }}>{fmtMoney(it.price)} each</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <button onClick={() => bumpQty(it.productId, -1)} style={{ width: 26, height: 26, border: `1px solid ${LINE}`, borderRadius: 3, background: PARCHMENT, cursor: 'pointer', fontFamily: 'monospace', fontWeight: 700 }}>−</button>
                <input type="number" min="1" value={it.qty} onChange={(e) => setQty(it.productId, e.target.value)} style={{ width: 40, padding: '5px 2px', textAlign: 'center', border: `1px solid ${LINE}`, borderRadius: 3, fontFamily: 'monospace', background: PARCHMENT }} />
                <button onClick={() => bumpQty(it.productId, 1)} style={{ width: 26, height: 26, border: `1px solid ${LINE}`, borderRadius: 3, background: PARCHMENT, cursor: 'pointer', fontFamily: 'monospace', fontWeight: 700 }}>+</button>
              </div>
              <div style={{ fontFamily: 'monospace', width: 70, textAlign: 'right' }}>{fmtMoney(it.qty * it.price)}</div>
              <button onClick={() => removeFromCart(it.productId)} style={{ background: 'none', border: 'none', color: WARN, cursor: 'pointer', fontSize: '0.8rem' }}>✕</button>
            </div>
          ))}
          <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 14, fontFamily: 'Fraunces, serif', fontSize: '1.25rem', fontWeight: 700 }}>
            <span>Total</span><span style={{ fontFamily: 'monospace' }}>{fmtMoney(total)}</span>
          </div>
        </Card>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <button onClick={() => checkout('account')} style={{ background: GREEN, color: PARCHMENT, border: 'none', padding: '16px 20px', borderRadius: 4, fontWeight: 600, fontSize: '0.95rem', cursor: 'pointer', textAlign: 'left' }}>
          Book to account
          <div style={{ fontWeight: 400, fontSize: '0.76rem', color: 'rgba(243,238,226,0.7)', marginTop: 2 }}>Adds {fmtMoney(total)} to {customer.name.split(' — ')[0]}'s monthly balance</div>
        </button>
        <button onClick={() => checkout('cash')} style={{ background: '#fff', color: CHARCOAL, border: `1px solid ${LINE}`, padding: '16px 20px', borderRadius: 4, fontWeight: 600, fontSize: '0.95rem', cursor: 'pointer', textAlign: 'left' }}>
          Cash / cheque
          <div style={{ fontWeight: 400, fontSize: '0.76rem', color: '#6b6659', marginTop: 2 }}>Settled now, nothing added to the account</div>
        </button>
      </div>
    </>
  );
}

function QuoteTab({ products }) {
  const [customerName, setCustomerName] = useState('');
  const [cart, setCart] = useState([]);
  const total = cart.reduce((s, it) => s + it.qty * it.price, 0);
  const validUntil = (() => {
    const d = new Date();
    d.setDate(d.getDate() + 14);
    return d.toISOString().slice(0, 10);
  })();

  function handleSelect(p) {
    const existing = cart.find((it) => it.productId === p.id);
    if (existing) {
      setCart(cart.map((it) => (it.productId === p.id ? { ...it, qty: it.qty + 1 } : it)));
    } else {
      setCart([...cart, { productId: p.id, name: p.name, price: p.price, qty: 1 }]);
    }
  }

  function setQty(productId, qty) {
    const q = Math.max(1, Number(qty) || 1);
    setCart(cart.map((it) => (it.productId === productId ? { ...it, qty: q } : it)));
  }

  function bumpQty(productId, delta) {
    const item = cart.find((it) => it.productId === productId);
    if (!item) return;
    setQty(productId, item.qty + delta);
  }

  function removeFromCart(productId) {
    setCart(cart.filter((it) => it.productId !== productId));
  }

  return (
    <>
      <div className="no-print">
        <Card>
          <Label>Quote — no stock is affected</Label>
          <div style={{ fontSize: '0.82rem', color: '#6b6659', marginBottom: 12 }}>
            Builds a price, nothing else. Nothing here touches stock levels or account balances — this is for giving someone a number, not recording a sale.
          </div>
          <input
            type="text" placeholder="Customer / farm name (optional)" value={customerName}
            onChange={(e) => setCustomerName(e.target.value)}
            style={{ width: '100%', padding: '9px 10px', border: `1px solid ${LINE}`, borderRadius: 3, background: PARCHMENT }}
          />
        </Card>

        <Card style={{ overflow: 'visible' }}>
          <Label>Add item</Label>
          <ProductSearch products={products} onSelect={handleSelect} />
        </Card>

        {cart.length > 0 && (
          <Card>
            {cart.map((it) => (
              <div key={it.productId} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: `1px solid ${LINE}`, gap: 10 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{it.name}</div>
                  <div style={{ fontSize: '0.76rem', color: '#6b6659' }}>{fmtMoney(it.price)} each</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <button onClick={() => bumpQty(it.productId, -1)} style={{ width: 26, height: 26, border: `1px solid ${LINE}`, borderRadius: 3, background: PARCHMENT, cursor: 'pointer', fontFamily: 'monospace', fontWeight: 700 }}>−</button>
                  <input type="number" min="1" value={it.qty} onChange={(e) => setQty(it.productId, e.target.value)} style={{ width: 40, padding: '5px 2px', textAlign: 'center', border: `1px solid ${LINE}`, borderRadius: 3, fontFamily: 'monospace', background: PARCHMENT }} />
                  <button onClick={() => bumpQty(it.productId, 1)} style={{ width: 26, height: 26, border: `1px solid ${LINE}`, borderRadius: 3, background: PARCHMENT, cursor: 'pointer', fontFamily: 'monospace', fontWeight: 700 }}>+</button>
                </div>
                <div style={{ fontFamily: 'monospace', width: 70, textAlign: 'right' }}>{fmtMoney(it.qty * it.price)}</div>
                <button onClick={() => removeFromCart(it.productId)} style={{ background: 'none', border: 'none', color: WARN, cursor: 'pointer', fontSize: '0.8rem' }}>✕</button>
              </div>
            ))}
            <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 14, fontFamily: 'Fraunces, serif', fontSize: '1.25rem', fontWeight: 700 }}>
              <span>Total</span><span style={{ fontFamily: 'monospace' }}>{fmtMoney(total)}</span>
            </div>
            <button onClick={() => window.print()} style={{ marginTop: 16, width: '100%', background: GREEN, color: PARCHMENT, border: 'none', padding: '12px 18px', borderRadius: 3, fontWeight: 600, cursor: 'pointer' }}>
              Print quote
            </button>
          </Card>
        )}
      </div>

      {cart.length > 0 && (
        <Card style={{ padding: '28px 26px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 22, borderBottom: `2px solid ${GREEN}`, paddingBottom: 16 }}>
            <div>
              <div style={{ fontFamily: 'Fraunces, serif', fontWeight: 600, fontSize: '1.3rem', color: GREEN }}>Roberts &amp; Bumford</div>
              <div style={{ fontSize: '0.76rem', color: '#6b6659' }}>Agricultural Stores &amp; Chemicals · Newtown, Powys SY16 2JS</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontFamily: 'monospace', fontSize: '0.76rem', color: '#8a8577', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Quote</div>
              <div style={{ fontFamily: 'monospace', fontSize: '0.85rem' }}>{todayISO()}</div>
            </div>
          </div>

          {customerName && (
            <div style={{ marginBottom: 18, fontWeight: 600, fontSize: '1rem' }}>{customerName}</div>
          )}

          {cart.map((it, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.84rem', padding: '8px 0', borderBottom: `1px solid ${LINE}` }}>
              <span>{it.qty}× {it.name}</span>
              <span style={{ fontFamily: 'monospace' }}>{fmtMoney(it.qty * it.price)}</span>
            </div>
          ))}

          <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 16, marginTop: 6, borderTop: `2px solid ${GREEN}`, fontFamily: 'Fraunces, serif', fontSize: '1.3rem', fontWeight: 700 }}>
            <span>Total</span>
            <span style={{ fontFamily: 'monospace' }}>{fmtMoney(total)}</span>
          </div>

          <div style={{ marginTop: 20, fontSize: '0.72rem', color: '#8a8577' }}>
            This is a price quote, not an order — nothing has been reserved or deducted from stock. Prices valid until {validUntil}, subject to availability at the time of order.
          </div>
        </Card>
      )}
    </>
  );
}

function GoodsInTab({ products, receiveStock }) {
  const [selected, setSelected] = useState(null);
  const [batch, setBatch] = useState('');
  const [qty, setQty] = useState(1);
  const [expiry, setExpiry] = useState('');
  const [confirmedList, setConfirmedList] = useState([]);

  function submit() {
    if (!selected) { alert('Search and select a product first.'); return; }
    if (!qty || Number(qty) <= 0) { alert('Enter a quantity.'); return; }
    receiveStock({ productId: selected.id, batch, qty: Number(qty), expiry });
    setConfirmedList([{ name: selected.name, batch: batch || '—', qty: Number(qty), expiry }, ...confirmedList]);
    setSelected(null);
    setBatch('');
    setQty(1);
    setExpiry('');
  }

  return (
    <>
      <Card style={{ overflow: 'visible' }}>
        <Label>Product</Label>
        {selected ? (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: PARCHMENT, border: `1px solid ${WHEAT}`, borderRadius: 3, padding: '10px 12px', marginBottom: 10 }}>
            <div>
              <div style={{ fontWeight: 600 }}>{selected.name}</div>
              <div style={{ fontSize: '0.75rem', color: '#8a8577', fontFamily: 'monospace' }}>{selected.code} · {selected.category}</div>
            </div>
            <button onClick={() => setSelected(null)} style={{ background: 'none', border: 'none', color: RUST, cursor: 'pointer', fontSize: '0.78rem' }}>Change</button>
          </div>
        ) : (
          <ProductSearch products={products} onSelect={setSelected} placeholder="Search product to receive…" />
        )}

        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <input type="text" placeholder="Batch number" value={batch} onChange={(e) => setBatch(e.target.value)} style={{ flex: 1, padding: '9px 10px', border: `1px solid ${LINE}`, borderRadius: 3, fontFamily: 'monospace', background: PARCHMENT }} />
          <input type="number" min="1" placeholder="Qty" value={qty} onChange={(e) => setQty(e.target.value)} style={{ width: 80, padding: '9px 10px', border: `1px solid ${LINE}`, borderRadius: 3, fontFamily: 'monospace', background: PARCHMENT }} />
          <input type="date" value={expiry} onChange={(e) => setExpiry(e.target.value)} style={{ flex: 1, padding: '9px 10px', border: `1px solid ${LINE}`, borderRadius: 3, fontFamily: 'monospace', background: PARCHMENT }} />
        </div>
        <button onClick={submit} style={{ marginTop: 10, background: GREEN, color: PARCHMENT, border: 'none', padding: '11px 16px', borderRadius: 3, fontWeight: 600, cursor: 'pointer', width: '100%' }}>
          Add to stock
        </button>
      </Card>

      {confirmedList.length > 0 && (
        <Card>
          <Label>Added this session</Label>
          {confirmedList.map((c, i) => (
            <div key={i} style={{ fontSize: '0.85rem', padding: '8px 0', borderTop: i === 0 ? 'none' : `1px solid ${LINE}` }}>
              <b>{c.qty}×</b> {c.name} <span style={{ fontFamily: 'monospace', color: '#8a8577' }}>batch {c.batch}{c.expiry ? `, exp ${c.expiry}` : ''}</span>
            </div>
          ))}
        </Card>
      )}
    </>
  );
}

function BatchRow({ batch, editStockBatch }) {
  const [editing, setEditing] = useState(false);
  const [qty, setQty] = useState(batch.qty);
  const [expiry, setExpiry] = useState(batch.expiry || '');
  const [reason, setReason] = useState('');

  function save() {
    if (!reason.trim()) { alert('Enter a reason for this correction.'); return; }
    editStockBatch(batch.id, { qty: Number(qty), expiry }, reason.trim());
    setEditing(false);
    setReason('');
  }

  if (!editing) {
    return (
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.78rem', fontFamily: 'monospace', color: '#6b6659', padding: '3px 0' }}>
        <span>batch {batch.batch}{batch.expiry ? ` · exp ${batch.expiry}` : ''}</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {batch.qty}
          <button onClick={() => setEditing(true)} style={{ background: 'none', border: 'none', color: RUST, cursor: 'pointer', fontFamily: 'Inter, sans-serif', fontSize: '0.72rem', textDecoration: 'underline' }}>Edit</button>
        </span>
      </div>
    );
  }

  return (
    <div style={{ background: PARCHMENT, border: `1px solid ${LINE}`, borderRadius: 3, padding: 10, margin: '4px 0' }}>
      <div style={{ display: 'flex', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
        <input type="number" value={qty} onChange={(e) => setQty(e.target.value)} style={{ width: 70, padding: '6px 8px', border: `1px solid ${LINE}`, borderRadius: 3, fontFamily: 'monospace', background: '#fff' }} />
        <input type="date" value={expiry} onChange={(e) => setExpiry(e.target.value)} style={{ flex: 1, minWidth: 130, padding: '6px 8px', border: `1px solid ${LINE}`, borderRadius: 3, fontFamily: 'monospace', background: '#fff' }} />
      </div>
      <input type="text" placeholder="Reason for correction (required)" value={reason} onChange={(e) => setReason(e.target.value)} style={{ width: '100%', padding: '6px 8px', border: `1px solid ${LINE}`, borderRadius: 3, background: '#fff', marginBottom: 8, fontSize: '0.8rem' }} />
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={save} style={{ background: GREEN, color: PARCHMENT, border: 'none', padding: '7px 14px', borderRadius: 3, fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer' }}>Save correction</button>
        <button onClick={() => setEditing(false)} style={{ background: 'none', border: `1px solid ${LINE}`, padding: '7px 14px', borderRadius: 3, fontSize: '0.78rem', cursor: 'pointer' }}>Cancel</button>
      </div>
    </div>
  );
}

function StockTab({ products, stockBatches, editStockBatch }) {
  const [filter, setFilter] = useState('');
  const filtered = products.filter((p) => p.name.toLowerCase().includes(filter.toLowerCase()) || p.code.toLowerCase().includes(filter.toLowerCase()));

  return (
    <>
      <Card>
        <input type="text" placeholder={`Filter ${products.length} products…`} value={filter} onChange={(e) => setFilter(e.target.value)} style={{ width: '100%', padding: '9px 10px', border: `1px solid ${LINE}`, borderRadius: 3, background: PARCHMENT }} />
      </Card>
      {filtered.map((p) => {
        const batches = stockBatches.filter((b) => b.productId === p.id && b.qty > 0);
        const total = batches.reduce((s, b) => s + b.qty, 0);
        return (
          <Card key={p.id}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
              <div>
                <div style={{ fontWeight: 600 }}>{p.name}</div>
                <div style={{ fontSize: '0.76rem', color: '#8a8577', fontFamily: 'monospace' }}>{p.code} · {p.category}</div>
              </div>
              <div style={{ fontFamily: 'monospace', fontSize: '1.1rem', color: total < 5 ? WARN : OK }}>{total} in stock</div>
            </div>
            {batches.length > 0 && (
              <div style={{ borderTop: `1px solid ${LINE}`, paddingTop: 8 }}>
                {batches.map((b) => <BatchRow key={b.id} batch={b} editStockBatch={editStockBatch} />)}
              </div>
            )}
          </Card>
        );
      })}
    </>
  );
}

function ReviewCard({ item, onResolve }) {
  const reasonLabel =
    item.reason === 'exact-barcode' ? 'Same barcode already exists' :
    item.reason === 'exact-code' ? 'Same product code already exists' : `${Math.round(item.score * 100)}% name match`;
  return (
    <div style={{ border: `1px solid ${WARN}`, borderRadius: 3, padding: '12px 14px', marginBottom: 10, background: '#fdf3ef' }}>
      <div style={{ fontSize: '0.68rem', fontFamily: 'monospace', color: WARN, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>
        {reasonLabel} — needs a decision
      </div>
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 160 }}>
          <div style={{ fontSize: '0.66rem', color: '#8a8577', textTransform: 'uppercase', marginBottom: 3 }}>New</div>
          <div style={{ fontWeight: 600, fontSize: '0.88rem' }}>{item.candidate.name}</div>
          <div style={{ fontSize: '0.74rem', fontFamily: 'monospace', color: '#8a8577' }}>{item.candidate.code || '—'} · {fmtMoney(item.candidate.price)}</div>
        </div>
        <div style={{ flex: 1, minWidth: 160 }}>
          <div style={{ fontSize: '0.66rem', color: '#8a8577', textTransform: 'uppercase', marginBottom: 3 }}>Already in catalogue</div>
          <div style={{ fontWeight: 600, fontSize: '0.88rem' }}>{item.match.name}</div>
          <div style={{ fontSize: '0.74rem', fontFamily: 'monospace', color: '#8a8577' }}>{item.match.code || '—'} · {fmtMoney(item.match.price)}</div>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
        <button onClick={() => onResolve('skip')} style={{ background: '#fff', border: `1px solid ${LINE}`, borderRadius: 3, padding: '7px 12px', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer' }}>
          Skip — same item
        </button>
        <button onClick={() => onResolve('add')} style={{ background: GREEN_MID, color: PARCHMENT, border: 'none', borderRadius: 3, padding: '7px 12px', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer' }}>
          Add as new item
        </button>
      </div>
    </div>
  );
}

function ProductsTab({ products, addProduct, importProducts, editProduct }) {
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [barcode, setBarcode] = useState('');
  const [category, setCategory] = useState('General');
  const [price, setPrice] = useState('');
  const [filter, setFilter] = useState('');
  const [importMsg, setImportMsg] = useState('');
  const [reviewQueue, setReviewQueue] = useState([]);
  const [pendingManual, setPendingManual] = useState(null);
  const fileRef = useRef(null);

  function submit() {
    if (!name.trim()) { alert('Enter a product name.'); return; }
    const candidate = { name: name.trim(), code: code.trim(), barcode: barcode.trim(), category, price: parseFloat(price) || 0 };
    const match = findBestMatch(products, candidate);
    if (match) {
      setPendingManual({ candidate, match: match.product, score: match.score, reason: match.reason });
      return;
    }
    addProduct(candidate);
    setName(''); setCode(''); setBarcode(''); setPrice('');
  }

  function resolvePendingManual(action) {
    if (action === 'add') {
      addProduct(pendingManual.candidate);
      setName(''); setCode(''); setBarcode(''); setPrice('');
    }
    setPendingManual(null);
  }

  function resolveReviewItem(tempId, action) {
    const item = reviewQueue.find((i) => i.tempId === tempId);
    if (!item) return;
    if (action === 'add') addProduct(item.candidate);
    setReviewQueue((prev) => prev.filter((i) => i.tempId !== tempId));
  }

  function handleFile(e) {
    const file = e.target.files[0];
    if (!file) return;
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const rows = results.data.filter((r) => r.name && String(r.name).trim());
        const clean = [];
        const flagged = [];
        let runningCatalogue = [...products];
        rows.forEach((r) => {
          const candidate = {
            name: String(r.name).trim(),
            code: String(r.code || '').trim(),
            barcode: String(r.barcode || '').trim(),
            category: String(r.category || 'General').trim(),
            price: parseFloat(r.price) || 0,
          };
          const match = findBestMatch(runningCatalogue, candidate);
          if (match) {
            flagged.push({ tempId: uid('rv'), candidate, match: match.product, score: match.score, reason: match.reason });
          } else {
            clean.push(candidate);
            runningCatalogue.push(candidate);
          }
        });
        if (clean.length) importProducts(clean);
        if (flagged.length) setReviewQueue((prev) => [...prev, ...flagged]);
        setImportMsg(
          `${clean.length} added automatically${flagged.length ? `, ${flagged.length} flagged below — need a decision` : '.'}`
        );
      },
      error: () => setImportMsg('Could not read that file — check it\u2019s a CSV with name, code, category, price columns.'),
    });
    e.target.value = '';
  }

  const filtered = products.filter((p) => p.name.toLowerCase().includes(filter.toLowerCase()) || p.code.toLowerCase().includes(filter.toLowerCase()));

  return (
    <>
      <Card>
        <Label>Bulk import (CSV)</Label>
        <div style={{ fontSize: '0.82rem', color: '#6b6659', marginBottom: 10 }}>
          Columns: <span style={{ fontFamily: 'monospace' }}>name, code, barcode, category, price</span>. Anything spelt similarly to an existing product, sharing a code, or sharing a barcode, gets held for you to check rather than added automatically.
        </div>
        <input ref={fileRef} type="file" accept=".csv" onChange={handleFile} style={{ fontSize: '0.85rem' }} />
        {importMsg && <div style={{ marginTop: 8, fontSize: '0.82rem', color: OK }}>{importMsg}</div>}
      </Card>

      {reviewQueue.length > 0 && (
        <Card>
          <Label>Needs a decision ({reviewQueue.length})</Label>
          {reviewQueue.map((item) => (
            <ReviewCard key={item.tempId} item={item} onResolve={(action) => resolveReviewItem(item.tempId, action)} />
          ))}
        </Card>
      )}

      <Card>
        <Label>Add single product</Label>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <input type="text" placeholder="Product name" value={name} onChange={(e) => setName(e.target.value)} style={{ padding: '9px 10px', border: `1px solid ${LINE}`, borderRadius: 3, background: PARCHMENT }} />
          <input type="text" placeholder="Barcode — scan it here to capture it" value={barcode} onChange={(e) => setBarcode(e.target.value)} style={{ padding: '9px 10px', border: `1px solid ${LINE}`, borderRadius: 3, fontFamily: 'monospace', background: PARCHMENT }} />
          <div style={{ display: 'flex', gap: 8 }}>
            <input type="text" placeholder="Code" value={code} onChange={(e) => setCode(e.target.value)} style={{ flex: 1, padding: '9px 10px', border: `1px solid ${LINE}`, borderRadius: 3, fontFamily: 'monospace', background: PARCHMENT }} />
            <select value={category} onChange={(e) => setCategory(e.target.value)} style={{ flex: 1, padding: '9px 10px', border: `1px solid ${LINE}`, borderRadius: 3, background: PARCHMENT }}>
              <option>General</option>
              <option>POM-VPS</option>
              <option>NFA-VPS</option>
              <option>AVM-GSL</option>
            </select>
            <input type="number" step="0.01" placeholder="Price" value={price} onChange={(e) => setPrice(e.target.value)} style={{ width: 90, padding: '9px 10px', border: `1px solid ${LINE}`, borderRadius: 3, fontFamily: 'monospace', background: PARCHMENT }} />
          </div>
          <button onClick={submit} style={{ background: GREEN_MID, color: PARCHMENT, border: 'none', padding: '10px 16px', borderRadius: 3, fontWeight: 600, cursor: 'pointer' }}>Add product</button>
          {pendingManual && (
            <ReviewCard item={pendingManual} onResolve={resolvePendingManual} />
          )}
        </div>
      </Card>

      <Card>
        <Label>Catalogue ({products.length})</Label>
        <input type="text" placeholder="Filter…" value={filter} onChange={(e) => setFilter(e.target.value)} style={{ width: '100%', padding: '8px 10px', border: `1px solid ${LINE}`, borderRadius: 3, background: PARCHMENT, marginBottom: 10 }} />
        <div style={{ maxHeight: 340, overflowY: 'auto' }}>
          {filtered.map((p) => <ProductRow key={p.id} product={p} editProduct={editProduct} />)}
        </div>
      </Card>
    </>
  );
}

function ProductRow({ product, editProduct }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(product.name);
  const [code, setCode] = useState(product.code);
  const [barcode, setBarcode] = useState(product.barcode || '');
  const [price, setPrice] = useState(product.price);
  const [reason, setReason] = useState('');

  function save() {
    if (!reason.trim()) { alert('Enter a reason for this correction.'); return; }
    editProduct(product.id, { name: name.trim(), code: code.trim(), barcode: barcode.trim(), price: parseFloat(price) || 0 }, reason.trim());
    setEditing(false);
    setReason('');
  }

  if (!editing) {
    return (
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 0', borderBottom: `1px solid ${LINE}`, fontSize: '0.82rem' }}>
        <span>{product.name} <span style={{ color: '#8a8577', fontFamily: 'monospace', fontSize: '0.72rem' }}>{product.code}{product.barcode ? ` · ${product.barcode}` : ''}</span></span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontFamily: 'monospace' }}>{fmtMoney(product.price)}</span>
          <button onClick={() => setEditing(true)} style={{ background: 'none', border: 'none', color: RUST, cursor: 'pointer', fontSize: '0.72rem', textDecoration: 'underline' }}>Edit</button>
        </span>
      </div>
    );
  }

  return (
    <div style={{ background: PARCHMENT, border: `1px solid ${LINE}`, borderRadius: 3, padding: 10, margin: '4px 0' }}>
      <div style={{ display: 'flex', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
        <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" style={{ flex: 1, minWidth: 140, padding: '6px 8px', border: `1px solid ${LINE}`, borderRadius: 3, background: '#fff' }} />
        <input type="text" value={code} onChange={(e) => setCode(e.target.value)} placeholder="Code" style={{ width: 90, padding: '6px 8px', border: `1px solid ${LINE}`, borderRadius: 3, fontFamily: 'monospace', background: '#fff' }} />
        <input type="text" value={barcode} onChange={(e) => setBarcode(e.target.value)} placeholder="Barcode" style={{ width: 120, padding: '6px 8px', border: `1px solid ${LINE}`, borderRadius: 3, fontFamily: 'monospace', background: '#fff' }} />
        <input type="number" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} style={{ width: 80, padding: '6px 8px', border: `1px solid ${LINE}`, borderRadius: 3, fontFamily: 'monospace', background: '#fff' }} />
      </div>
      <input type="text" placeholder="Reason for correction (required)" value={reason} onChange={(e) => setReason(e.target.value)} style={{ width: '100%', padding: '6px 8px', border: `1px solid ${LINE}`, borderRadius: 3, background: '#fff', marginBottom: 8, fontSize: '0.8rem' }} />
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={save} style={{ background: GREEN, color: PARCHMENT, border: 'none', padding: '7px 14px', borderRadius: 3, fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer' }}>Save correction</button>
        <button onClick={() => setEditing(false)} style={{ background: 'none', border: `1px solid ${LINE}`, padding: '7px 14px', borderRadius: 3, fontSize: '0.78rem', cursor: 'pointer' }}>Cancel</button>
      </div>
    </div>
  );
}

function ReturnLine({ tx, item, alreadyReturnedQty, processReturn }) {
  const [open, setOpen] = useState(false);
  const [qty, setQty] = useState(1);
  const [reason, setReason] = useState('unopened');
  const [restock, setRestock] = useState(true);
  const [done, setDone] = useState(null);

  const already = alreadyReturnedQty(tx.id, item.productId);
  const remaining = item.qty - already;

  function handleReasonChange(r) {
    setReason(r);
    if (r === 'opened') setRestock(false);
    else setRestock(true);
  }

  function submit() {
    const q = Math.min(Number(qty) || 0, remaining);
    if (q <= 0) { alert('Nothing left on this line to return.'); return; }
    const rec = processReturn({ tx, item, qty: q, restock, reason });
    setDone(rec);
    setOpen(false);
  }

  if (remaining <= 0 && !done) {
    return (
      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', fontSize: '0.82rem', color: '#8a8577' }}>
        <span>{item.name} × {item.qty}</span>
        <span>Fully returned</span>
      </div>
    );
  }

  return (
    <div style={{ padding: '10px 0', borderTop: `1px solid ${LINE}` }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ fontWeight: 600, fontSize: '0.88rem' }}>{item.name}</div>
          <div style={{ fontSize: '0.74rem', color: '#8a8577' }}>
            Sold {item.qty} · {fmtMoney(item.price)} each{already > 0 ? ` · ${already} already returned` : ''}
          </div>
        </div>
        {!done && (
          <button onClick={() => setOpen((v) => !v)} style={{ background: 'none', border: `1px solid ${LINE}`, borderRadius: 3, padding: '6px 12px', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer' }}>
            {open ? 'Cancel' : 'Return'}
          </button>
        )}
      </div>

      {done && (
        <div style={{ marginTop: 8, fontSize: '0.8rem', color: OK }}>
          {done.qty} returned{done.restocked ? ', added back to stock' : ', not restocked'}
          {tx.method === 'account' ? ` — ${fmtMoney(done.refundAmount)} credited to account` : ` — ${fmtMoney(done.refundAmount)} cash refund to issue`}
        </div>
      )}

      {open && (
        <div style={{ marginTop: 10, background: PARCHMENT, border: `1px solid ${LINE}`, borderRadius: 3, padding: 12 }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
            <input type="number" min="1" max={remaining} value={qty} onChange={(e) => setQty(e.target.value)} style={{ width: 70, padding: '8px', border: `1px solid ${LINE}`, borderRadius: 3, fontFamily: 'monospace', background: '#fff' }} />
            <select value={reason} onChange={(e) => handleReasonChange(e.target.value)} style={{ flex: 1, minWidth: 160, padding: '8px', border: `1px solid ${LINE}`, borderRadius: 3, background: '#fff' }}>
              <option value="unopened">Unopened / unwanted</option>
              <option value="wrong">Wrong item ordered</option>
              <option value="opened">Opened / damaged — do not restock</option>
              <option value="other">Other</option>
            </select>
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.82rem', marginBottom: 10, opacity: reason === 'opened' ? 0.5 : 1 }}>
            <input type="checkbox" checked={restock} disabled={reason === 'opened'} onChange={(e) => setRestock(e.target.checked)} />
            Return to stock
          </label>
          {reason === 'opened' && (
            <div style={{ fontSize: '0.74rem', color: WARN, marginBottom: 10 }}>Opened or damaged product can't go back into sellable stock.</div>
          )}
          <button onClick={submit} style={{ background: GREEN, color: PARCHMENT, border: 'none', padding: '9px 16px', borderRadius: 3, fontWeight: 600, cursor: 'pointer' }}>
            Confirm return — {fmtMoney((Math.min(Number(qty) || 0, remaining)) * item.price)}
          </button>
        </div>
      )}
    </div>
  );
}

function ReturnsTab({ transactions, customers, returns, alreadyReturnedQty, processReturn }) {
  const [search, setSearch] = useState('');

  const filtered = transactions.filter((t) => {
    if (!search.trim()) return true;
    const c = customers.find((c) => c.id === t.customerId);
    const q = search.toLowerCase();
    return (c && c.name.toLowerCase().includes(q)) || t.items.some((it) => it.name.toLowerCase().includes(q));
  }).slice(0, 15);

  return (
    <>
      <Card>
        <Label>Find the original sale</Label>
        <input type="text" placeholder="Search by customer or product…" value={search} onChange={(e) => setSearch(e.target.value)} style={{ width: '100%', padding: '9px 10px', border: `1px solid ${LINE}`, borderRadius: 3, background: PARCHMENT }} />
      </Card>

      {filtered.length === 0 && (
        <Card><div style={{ fontSize: '0.85rem', color: '#8a8577' }}>No matching sales found.</div></Card>
      )}

      {filtered.map((tx) => {
        const c = customers.find((c) => c.id === tx.customerId);
        return (
          <Card key={tx.id}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{c ? c.name : 'Unknown customer'}</div>
              <div style={{ fontFamily: 'monospace', fontSize: '0.78rem', color: '#8a8577' }}>{tx.date} · {tx.method === 'account' ? 'Account' : 'Cash/cheque'}</div>
            </div>
            {tx.items.map((item, i) => (
              <ReturnLine key={i} tx={tx} item={item} alreadyReturnedQty={alreadyReturnedQty} processReturn={processReturn} />
            ))}
          </Card>
        );
      })}
    </>
  );
}

function AccountRow({ customer, transactions, payments, returns, getBalance, recordPayment }) {
  const [showForm, setShowForm] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('cash');
  const [note, setNote] = useState('');

  const bal = getBalance(customer.id);
  const sales = transactions
    .filter((t) => t.customerId === customer.id && t.method === 'account')
    .map((t) => ({ kind: 'charge', date: t.date, id: t.id, label: t.items.map((it) => `${it.qty}× ${it.name}`).join(', '), amount: t.total }));
  const pays = payments
    .filter((p) => p.customerId === customer.id)
    .map((p) => ({ kind: 'payment', date: p.date, id: p.id, label: `Payment received — ${p.method}${p.note ? ` (${p.note})` : ''}`, amount: p.amount }));
  const ledger = [...sales, ...pays].sort((a, b) => (a.date < b.date ? 1 : -1));

  // everything this customer has ever bought, however they paid — plus every return —
  // independent of the account balance above, purely "what have they had off us".
  const fullHistory = [
    ...transactions.filter((t) => t.customerId === customer.id).map((t) => ({
      id: t.id, date: t.date, method: t.method,
      label: t.items.map((it) => `${it.qty}× ${it.name}`).join(', '),
      amount: t.total, isReturn: false,
    })),
    ...returns.filter((r) => r.customerId === customer.id).map((r) => ({
      id: r.id, date: r.date, method: r.originalMethod,
      label: `Return — ${r.qty}× ${r.productName}${r.restocked ? '' : ' (not restocked)'}`,
      amount: r.refundAmount, isReturn: true,
    })),
  ].sort((a, b) => (a.date < b.date ? 1 : -1));

  function submitPayment() {
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) { alert('Enter a payment amount.'); return; }
    recordPayment({ customerId: customer.id, amount: amt, method, note });
    setAmount(''); setNote(''); setShowForm(false);
  }

  return (
    <Card>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8, flexWrap: 'wrap', gap: 10 }}>
        <div>
          <div style={{ fontWeight: 600 }}>{customer.name}</div>
          <div style={{ fontSize: '0.76rem', color: '#8a8577' }}>{customer.location}</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontFamily: 'monospace', fontSize: '1.15rem', fontWeight: 700, color: bal > 0 ? WARN : OK }}>{fmtMoney(bal)}</div>
          <button onClick={() => setShowForm((v) => !v)} style={{ marginTop: 4, background: 'none', border: 'none', color: GREEN_MID, fontSize: '0.78rem', textDecoration: 'underline', cursor: 'pointer' }}>
            {showForm ? 'Cancel' : 'Record payment'}
          </button>
        </div>
      </div>

      {showForm && (
        <div style={{ background: PARCHMENT, border: `1px solid ${LINE}`, borderRadius: 3, padding: 12, marginBottom: 10 }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <input type="number" step="0.01" placeholder="Amount" value={amount} onChange={(e) => setAmount(e.target.value)} style={{ width: 100, padding: '8px 10px', border: `1px solid ${LINE}`, borderRadius: 3, fontFamily: 'monospace', background: '#fff' }} />
            <select value={method} onChange={(e) => setMethod(e.target.value)} style={{ padding: '8px 10px', border: `1px solid ${LINE}`, borderRadius: 3, background: '#fff' }}>
              <option value="cash">Cash</option>
              <option value="cheque">Cheque</option>
              <option value="bank transfer">Bank transfer</option>
            </select>
            <input type="text" placeholder="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} style={{ flex: 1, minWidth: 120, padding: '8px 10px', border: `1px solid ${LINE}`, borderRadius: 3, background: '#fff' }} />
          </div>
          <button onClick={submitPayment} style={{ marginTop: 8, background: GREEN, color: PARCHMENT, border: 'none', padding: '9px 16px', borderRadius: 3, fontWeight: 600, cursor: 'pointer' }}>
            Confirm payment
          </button>
        </div>
      )}

      {ledger.length > 0 && (
        <div style={{ borderTop: `1px solid ${LINE}`, paddingTop: 8 }}>
          {ledger.map((e) => (
            <div key={e.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', color: '#6b6659', padding: '4px 0' }}>
              <span>{e.date} — {e.label}</span>
              <span style={{ fontFamily: 'monospace', color: e.kind === 'payment' ? OK : CHARCOAL }}>
                {e.kind === 'payment' ? '− ' : ''}{fmtMoney(e.amount)}
              </span>
            </div>
          ))}
        </div>
      )}

      <button
        onClick={() => setShowHistory((v) => !v)}
        style={{ marginTop: 10, background: 'none', border: 'none', color: RUST, fontSize: '0.76rem', textDecoration: 'underline', cursor: 'pointer', padding: 0 }}
      >
        {showHistory ? 'Hide full purchase history' : 'Show full purchase history (account, cash & cheque)'}
      </button>

      {showHistory && (
        <div style={{ marginTop: 10, background: PARCHMENT, border: `1px solid ${LINE}`, borderRadius: 3, padding: '10px 12px' }}>
          {fullHistory.length === 0 ? (
            <div style={{ fontSize: '0.8rem', color: '#8a8577' }}>Nothing recorded for this customer yet.</div>
          ) : (
            fullHistory.map((h) => (
              <div key={h.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.78rem', padding: '5px 0', borderBottom: `1px solid ${LINE}` }}>
                <span>{h.date} — {h.label}</span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontFamily: 'monospace', fontSize: '0.68rem', background: h.method === 'account' ? '#eaf0ea' : '#f0e9e0', color: h.method === 'account' ? GREEN_MID : RUST, padding: '1px 6px', borderRadius: 10 }}>
                    {h.method === 'account' ? 'account' : 'cash/cheque'}
                  </span>
                  <span style={{ fontFamily: 'monospace', color: h.isReturn ? OK : CHARCOAL }}>{h.isReturn ? '− ' : ''}{fmtMoney(h.amount)}</span>
                </span>
              </div>
            ))
          )}
        </div>
      )}
    </Card>
  );
}

function AccountsTab({ customers, transactions, payments, returns, getBalance, recordPayment }) {
  return (
    <>
      {customers.map((c) => (
        <AccountRow key={c.id} customer={c} transactions={transactions} payments={payments} returns={returns} getBalance={getBalance} recordPayment={recordPayment} />
      ))}
    </>
  );
}

function currentMonthStr() {
  return todayISO().slice(0, 7);
}
function monthBounds(monthStr) {
  const start = `${monthStr}-01`;
  const [y, m] = monthStr.split('-').map(Number);
  const nextMonth = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
  const end = `${nextMonth}-01`;
  return { start, end };
}

function BillingTab({ customers, transactions, payments, returns }) {
  const [customerId, setCustomerId] = useState(customers[0].id);
  const [monthStr, setMonthStr] = useState(currentMonthStr());
  const customer = customers.find((c) => c.id === customerId);
  const { start, end } = monthBounds(monthStr);

  const ledger = [
    ...transactions.filter((t) => t.customerId === customerId && t.method === 'account').map((t) => ({ date: t.date, amount: t.total })),
    ...payments.filter((p) => p.customerId === customerId).map((p) => ({ date: p.date, amount: -p.amount })),
  ];
  const openingBalance = ledger.filter((e) => e.date < start).reduce((s, e) => s + e.amount, 0);

  const chargesInPeriod = transactions.filter((t) => t.customerId === customerId && t.method === 'account' && t.date >= start && t.date < end);
  const returnsInPeriod = returns.filter((r) => r.customerId === customerId && r.originalMethod === 'account' && r.date >= start && r.date < end);
  const paymentsInPeriod = payments.filter((p) => p.customerId === customerId && p.method !== 'return credit' && p.date >= start && p.date < end);

  const totalCharged = chargesInPeriod.reduce((s, t) => s + t.total, 0);
  const totalReturned = returnsInPeriod.reduce((s, r) => s + r.refundAmount, 0);
  const totalPaid = paymentsInPeriod.reduce((s, p) => s + p.amount, 0);
  const closingBalance = openingBalance + totalCharged - totalReturned - totalPaid;

  const rows = [
    ...chargesInPeriod.map((t) => ({ date: t.date, desc: t.items.map((it) => `${it.qty}× ${it.name}`).join(', '), amount: t.total })),
    ...returnsInPeriod.map((r) => ({ date: r.date, desc: `Return — ${r.qty}× ${r.productName}`, amount: -r.refundAmount })),
    ...paymentsInPeriod.map((p) => ({ date: p.date, desc: `Payment received (${p.method})`, amount: -p.amount })),
  ].sort((a, b) => (a.date > b.date ? 1 : a.date < b.date ? -1 : 0));

  return (
    <>
      <div className="no-print">
        <Card>
          <Label>Statement</Label>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <select value={customerId} onChange={(e) => setCustomerId(e.target.value)} style={{ flex: 1, minWidth: 200, padding: '9px 10px', border: `1px solid ${LINE}`, borderRadius: 3, background: PARCHMENT }}>
              {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <input type="month" value={monthStr} onChange={(e) => setMonthStr(e.target.value)} style={{ padding: '9px 10px', border: `1px solid ${LINE}`, borderRadius: 3, background: PARCHMENT, fontFamily: 'monospace' }} />
            <button onClick={() => window.print()} style={{ background: GREEN, color: PARCHMENT, border: 'none', padding: '9px 18px', borderRadius: 3, fontWeight: 600, cursor: 'pointer' }}>
              Print statement
            </button>
          </div>
        </Card>
      </div>

      <Card style={{ padding: '28px 26px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 22, borderBottom: `2px solid ${GREEN}`, paddingBottom: 16 }}>
          <div>
            <div style={{ fontFamily: 'Fraunces, serif', fontWeight: 600, fontSize: '1.3rem', color: GREEN }}>Roberts &amp; Bumford</div>
            <div style={{ fontSize: '0.76rem', color: '#6b6659' }}>Agricultural Stores &amp; Chemicals · Newtown, Powys SY16 2JS</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontFamily: 'monospace', fontSize: '0.76rem', color: '#8a8577', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Account statement</div>
            <div style={{ fontFamily: 'monospace', fontSize: '0.9rem', fontWeight: 700 }}>{monthStr}</div>
          </div>
        </div>

        <div style={{ marginBottom: 18 }}>
          <div style={{ fontWeight: 600, fontSize: '1rem' }}>{customer.name}</div>
          <div style={{ fontSize: '0.82rem', color: '#6b6659' }}>{customer.location}</div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', fontFamily: 'monospace', padding: '10px 0', borderTop: `1px solid ${LINE}`, borderBottom: `1px solid ${LINE}`, marginBottom: 4 }}>
          <span>Balance brought forward</span>
          <span>{fmtMoney(openingBalance)}</span>
        </div>

        {rows.length === 0 ? (
          <div style={{ padding: '18px 0', fontSize: '0.85rem', color: '#8a8577' }}>No account activity this month.</div>
        ) : (
          rows.map((r, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.84rem', padding: '8px 0', borderBottom: `1px solid ${LINE}` }}>
              <span>{r.date} — {r.desc}</span>
              <span style={{ fontFamily: 'monospace', color: r.amount < 0 ? OK : CHARCOAL }}>
                {r.amount < 0 ? '− ' : ''}{fmtMoney(Math.abs(r.amount))}
              </span>
            </div>
          ))
        )}

        <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 16, marginTop: 6, borderTop: `2px solid ${GREEN}`, fontFamily: 'Fraunces, serif', fontSize: '1.3rem', fontWeight: 700 }}>
          <span>Balance due</span>
          <span style={{ fontFamily: 'monospace' }}>{fmtMoney(closingBalance)}</span>
        </div>

        <div style={{ marginTop: 20, fontSize: '0.72rem', color: '#8a8577' }}>
          This statement covers activity on your trade account only. Purchases paid by cash or cheque at the time of sale are settled and not shown here.
        </div>
      </Card>
    </>
  );
}

function CustomerRow({ customer, editCustomer, getBalance }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(customer.name);
  const [location, setLocation] = useState(customer.location);

  function save() {
    if (!name.trim()) { alert('Enter a name.'); return; }
    editCustomer(customer.id, { name: name.trim(), location: location.trim() });
    setEditing(false);
  }

  const bal = getBalance(customer.id);

  if (!editing) {
    return (
      <Card>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontWeight: 600 }}>{customer.name}</div>
            <div style={{ fontSize: '0.76rem', color: '#8a8577' }}>{customer.location}</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontFamily: 'monospace', fontSize: '0.95rem', color: bal > 0 ? WARN : OK }}>{fmtMoney(bal)}</div>
            <button onClick={() => setEditing(true)} style={{ marginTop: 4, background: 'none', border: 'none', color: GREEN_MID, fontSize: '0.76rem', textDecoration: 'underline', cursor: 'pointer' }}>Edit</button>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <Card>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Farm / customer name" style={{ padding: '8px 10px', border: `1px solid ${LINE}`, borderRadius: 3, background: PARCHMENT }} />
        <input type="text" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Location" style={{ padding: '8px 10px', border: `1px solid ${LINE}`, borderRadius: 3, background: PARCHMENT }} />
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={save} style={{ background: GREEN, color: PARCHMENT, border: 'none', padding: '8px 16px', borderRadius: 3, fontWeight: 600, cursor: 'pointer' }}>Save</button>
          <button onClick={() => setEditing(false)} style={{ background: 'none', border: `1px solid ${LINE}`, padding: '8px 16px', borderRadius: 3, cursor: 'pointer' }}>Cancel</button>
        </div>
      </div>
    </Card>
  );
}

function CustomersTab({ customers, addCustomer, editCustomer, getBalance }) {
  const [name, setName] = useState('');
  const [location, setLocation] = useState('');
  const [filter, setFilter] = useState('');

  function submit() {
    if (!name.trim()) { alert('Enter a name.'); return; }
    addCustomer({ name: name.trim(), location: location.trim() });
    setName(''); setLocation('');
  }

  const filtered = customers.filter((c) => c.name.toLowerCase().includes(filter.toLowerCase()));

  return (
    <>
      <Card>
        <Label>Add customer</Label>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <input type="text" placeholder="Farm / customer name" value={name} onChange={(e) => setName(e.target.value)} style={{ padding: '9px 10px', border: `1px solid ${LINE}`, borderRadius: 3, background: PARCHMENT }} />
          <input type="text" placeholder="Location" value={location} onChange={(e) => setLocation(e.target.value)} style={{ padding: '9px 10px', border: `1px solid ${LINE}`, borderRadius: 3, background: PARCHMENT }} />
          <button onClick={submit} style={{ background: GREEN_MID, color: PARCHMENT, border: 'none', padding: '10px 16px', borderRadius: 3, fontWeight: 600, cursor: 'pointer' }}>Add customer</button>
        </div>
      </Card>

      <Card>
        <input type="text" placeholder={`Filter ${customers.length} customers…`} value={filter} onChange={(e) => setFilter(e.target.value)} style={{ width: '100%', padding: '8px 10px', border: `1px solid ${LINE}`, borderRadius: 3, background: PARCHMENT }} />
      </Card>

      {filtered.map((c) => <CustomerRow key={c.id} customer={c} editCustomer={editCustomer} getBalance={getBalance} />)}
    </>
  );
}

function SettingsTab({ staffList, addStaffMember, corrections, exportAllData, lockAfterMinutes, setLockAfterMinutes }) {
  const [newStaffName, setNewStaffName] = useState('');
  const [newStaffPin, setNewStaffPin] = useState('');

  function submit() {
    if (!newStaffName.trim() || !newStaffPin.trim()) { alert('Enter a name and an employee number.'); return; }
    addStaffMember(newStaffName, newStaffPin);
    setNewStaffName(''); setNewStaffPin('');
  }

  return (
    <>
      <Card>
        <Label>Auto-lock</Label>
        <div style={{ fontSize: '0.82rem', color: '#6b6659', marginBottom: 10 }}>
          After this many minutes with no activity, the screen locks and needs an employee number to get back in.
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input type="number" min="1" value={lockAfterMinutes} onChange={(e) => setLockAfterMinutes(Math.max(1, Number(e.target.value) || 1))} style={{ width: 70, padding: '8px 10px', border: `1px solid ${LINE}`, borderRadius: 3, fontFamily: 'monospace', background: PARCHMENT }} />
          <span style={{ fontSize: '0.85rem' }}>minutes</span>
        </div>
      </Card>

      <Card>
        <Label>Staff</Label>
        <div style={{ fontSize: '0.82rem', color: '#6b6659', marginBottom: 10 }}>
          Each staff member gets their own employee number. Whoever unlocks the screen with it is attached to every sale, delivery, payment, and correction from that point on.
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 10 }}>
          {staffList.map((s) => (
            <div key={s.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', padding: '5px 0', borderBottom: `1px solid ${LINE}` }}>
              <span>{s.name}</span>
              <span style={{ fontFamily: 'monospace', color: '#8a8577' }}>#{s.pin}</span>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input type="text" placeholder="Staff name" value={newStaffName} onChange={(e) => setNewStaffName(e.target.value)} style={{ flex: 1, minWidth: 120, padding: '9px 10px', border: `1px solid ${LINE}`, borderRadius: 3, background: PARCHMENT }} />
          <input type="text" placeholder="Employee number" value={newStaffPin} onChange={(e) => setNewStaffPin(e.target.value)} style={{ width: 130, padding: '9px 10px', border: `1px solid ${LINE}`, borderRadius: 3, fontFamily: 'monospace', background: PARCHMENT }} />
          <button onClick={submit} style={{ background: GREEN_MID, color: PARCHMENT, border: 'none', padding: '9px 16px', borderRadius: 3, fontWeight: 600, cursor: 'pointer' }}>Add</button>
        </div>
      </Card>

      <Card>
        <Label>Backup</Label>
        <div style={{ fontSize: '0.82rem', color: '#6b6659', marginBottom: 10 }}>
          This prototype stores everything in the browser, not a real server — export regularly so nothing's lost, and keep this as the seed data if it ever moves to a proper database.
        </div>
        <button onClick={exportAllData} style={{ background: GREEN, color: PARCHMENT, border: 'none', padding: '10px 18px', borderRadius: 3, fontWeight: 600, cursor: 'pointer' }}>
          Export all data (.json)
        </button>
      </Card>

      <Card>
        <Label>Correction log ({corrections.length})</Label>
        {corrections.length === 0 ? (
          <div style={{ fontSize: '0.82rem', color: '#8a8577' }}>No corrections recorded yet.</div>
        ) : (
          <div style={{ maxHeight: 320, overflowY: 'auto' }}>
            {corrections.map((c) => (
              <div key={c.id} style={{ padding: '10px 0', borderBottom: `1px solid ${LINE}`, fontSize: '0.8rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', color: '#6b6659', fontFamily: 'monospace', fontSize: '0.72rem', marginBottom: 3 }}>
                  <span>{c.date} · {c.staff}</span><span>{c.entity}</span>
                </div>
                <div style={{ fontWeight: 600 }}>{c.entityLabel}</div>
                {c.changes.map((ch, i) => (
                  <div key={i} style={{ fontFamily: 'monospace', fontSize: '0.74rem', color: '#8a8577' }}>
                    {ch.field}: {String(ch.from)} → {String(ch.to)}
                  </div>
                ))}
                {c.reason && <div style={{ fontSize: '0.78rem', marginTop: 3, fontStyle: 'italic' }}>"{c.reason}"</div>}
              </div>
            ))}
          </div>
        )}
      </Card>
    </>
  );
}

function LockScreen({ tryUnlock }) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState(false);

  function submit() {
    const ok = tryUnlock(pin);
    if (!ok) {
      setError(true);
      setPin('');
    }
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter') submit();
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000, background: GREEN,
      display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column',
      fontFamily: 'Inter, sans-serif', color: PARCHMENT,
    }}>
      <div style={{ width: 40, height: 40, borderRadius: '50%', border: `1px solid ${WHEAT}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, color: WHEAT, fontFamily: 'monospace', marginBottom: 18 }}>R&B</div>
      <div style={{ fontFamily: 'Fraunces, serif', fontSize: '1.3rem', marginBottom: 6 }}>Screen locked</div>
      <div style={{ fontSize: '0.85rem', color: 'rgba(243,238,226,0.7)', marginBottom: 24 }}>Enter your employee number to continue</div>
      <input
        type="password"
        inputMode="numeric"
        autoFocus
        value={pin}
        onChange={(e) => { setPin(e.target.value); setError(false); }}
        onKeyDown={handleKeyDown}
        style={{
          width: 180, textAlign: 'center', fontSize: '1.3rem', letterSpacing: '0.3em', padding: '12px 10px',
          borderRadius: 4, border: `1px solid ${error ? WARN : WHEAT}`, background: 'rgba(243,238,226,0.08)', color: '#fff',
          fontFamily: 'monospace', marginBottom: 12,
        }}
      />
      {error && <div style={{ fontSize: '0.78rem', color: '#f0a98f', marginBottom: 12 }}>Number not recognised — try again.</div>}
      <button
        onClick={submit}
        style={{ background: WHEAT, color: GREEN, border: 'none', padding: '11px 28px', borderRadius: 3, fontWeight: 600, cursor: 'pointer', fontSize: '0.9rem' }}
      >
        Unlock
      </button>
    </div>
  );
}

function LabelsTab({ products, corrections, printedCorrectionIds, markLabelsPrinted }) {
  const priceChanges = corrections
    .filter((c) => c.entity === 'product' && c.changes.some((ch) => ch.field === 'price'))
    .map((c) => {
      const priceChange = c.changes.find((ch) => ch.field === 'price');
      const product = products.find((p) => p.id === c.entityId);
      return { ...c, from: priceChange.from, to: priceChange.to, product };
    })
    .filter((c) => c.product); // drop changes for since-deleted products

  const pending = priceChanges.filter((c) => !printedCorrectionIds.includes(c.id));
  const alreadyPrinted = priceChanges.filter((c) => printedCorrectionIds.includes(c.id));

  const [selected, setSelected] = useState(() => new Set(pending.map((c) => c.id)));
  const [showHistory, setShowHistory] = useState(false);

  function toggle(id) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function selectAll() {
    setSelected(new Set(pending.map((c) => c.id)));
  }

  function markSelectedPrinted() {
    if (selected.size === 0) { alert('Select at least one price change first.'); return; }
    markLabelsPrinted([...selected]);
    setSelected(new Set());
  }

  const toPrint = pending.filter((c) => selected.has(c.id));

  return (
    <>
      <div className="no-print">
        <Card>
          <Label>Price changes awaiting labels ({pending.length})</Label>
          {pending.length === 0 ? (
            <div style={{ fontSize: '0.85rem', color: '#8a8577' }}>Nothing waiting — every price change has had a label printed.</div>
          ) : (
            <>
              <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
                <button onClick={selectAll} style={{ background: 'none', border: `1px solid ${LINE}`, borderRadius: 3, padding: '6px 12px', fontSize: '0.76rem', cursor: 'pointer' }}>Select all</button>
                <button onClick={() => setSelected(new Set())} style={{ background: 'none', border: `1px solid ${LINE}`, borderRadius: 3, padding: '6px 12px', fontSize: '0.76rem', cursor: 'pointer' }}>Clear</button>
              </div>
              {pending.map((c) => (
                <label key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: `1px solid ${LINE}`, fontSize: '0.85rem', cursor: 'pointer' }}>
                  <input type="checkbox" checked={selected.has(c.id)} onChange={() => toggle(c.id)} />
                  <span style={{ flex: 1 }}>{c.product.name}</span>
                  <span style={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>
                    <span style={{ textDecoration: 'line-through', color: '#8a8577' }}>{fmtMoney(c.from)}</span> → <b>{fmtMoney(c.to)}</b>
                  </span>
                </label>
              ))}
              <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
                <button onClick={() => window.print()} style={{ background: GREEN, color: PARCHMENT, border: 'none', padding: '10px 18px', borderRadius: 3, fontWeight: 600, cursor: 'pointer' }}>
                  Print {selected.size} label{selected.size === 1 ? '' : 's'}
                </button>
                <button onClick={markSelectedPrinted} style={{ background: 'none', border: `1px solid ${LINE}`, padding: '10px 18px', borderRadius: 3, fontWeight: 600, cursor: 'pointer' }}>
                  Mark as printed
                </button>
              </div>
              <div style={{ fontSize: '0.74rem', color: '#8a8577', marginTop: 8 }}>
                Printing opens your browser's print dialog — it doesn't confirm the labels came out, so "Mark as printed" is a separate step once they actually have.
              </div>
            </>
          )}
        </Card>

        {alreadyPrinted.length > 0 && (
          <Card>
            <button onClick={() => setShowHistory((v) => !v)} style={{ background: 'none', border: 'none', color: RUST, fontSize: '0.8rem', textDecoration: 'underline', cursor: 'pointer', padding: 0 }}>
              {showHistory ? 'Hide' : 'Show'} already-printed history ({alreadyPrinted.length})
            </button>
            {showHistory && alreadyPrinted.map((c) => (
              <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', padding: '6px 0', borderTop: `1px solid ${LINE}`, marginTop: 8 }}>
                <span>{c.date} — {c.product.name}</span>
                <span style={{ fontFamily: 'monospace' }}>{fmtMoney(c.from)} → {fmtMoney(c.to)}</span>
              </div>
            ))}
          </Card>
        )}
      </div>

      {toPrint.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
          {toPrint.map((c) => (
            <div key={c.id} style={{ border: `1px dashed ${LINE}`, borderRadius: 4, padding: '14px 12px', background: '#fff', textAlign: 'center' }}>
              <div style={{ fontSize: '0.78rem', fontWeight: 600, marginBottom: 6, minHeight: '2.2em' }}>{c.product.name}</div>
              <div style={{ fontSize: '0.72rem', color: '#8a8577', textDecoration: 'line-through', fontFamily: 'monospace' }}>{fmtMoney(c.from)}</div>
              <div style={{ fontFamily: 'Fraunces, serif', fontWeight: 700, fontSize: '1.5rem', color: GREEN }}>{fmtMoney(c.to)}</div>
              {c.product.barcode && <div style={{ fontFamily: 'monospace', fontSize: '0.65rem', color: '#8a8577', marginTop: 4 }}>{c.product.barcode}</div>}
            </div>
          ))}
        </div>
      )}
    </>
  );
}
