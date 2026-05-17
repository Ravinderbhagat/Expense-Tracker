const STORAGE_KEY = 'expenseTracker_v2';
const BUDGET_KEY  = 'expenseTracker_budget';

const CATEGORY_META = {
  Food:          { icon: '🍔', color: '#e67e22' },
  Travel:        { icon: '🚇', color: '#2980b9' },
  Shopping:      { icon: '🛍️', color: '#8e44ad' },
  Education:     { icon: '📚', color: '#16a085' },
  Health:        { icon: '💊', color: '#27ae60' },
  Entertainment: { icon: '🎮', color: '#c0392b' },
  Other:         { icon: '📦', color: '#7f8c8d' },
};

let expenses     = [];
let activeFilter = 'All';
let activeSort   = 'date-desc';
let searchQuery  = '';
let chartInst    = null;
let viewYear, viewMonth;

function load() {
  try { expenses = JSON.parse(localStorage.getItem(STORAGE_KEY)) || []; }
  catch { expenses = []; }
}

function save() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(expenses));
}

function todayStr() {
  return new Date().toISOString().split('T')[0];
}

function fmtDate(str) {
  if (!str) return '';
  const [y, m, d] = str.split('-');
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${d} ${months[+m - 1]} ${y}`;
}

function monthKey(str) {
  return str ? str.slice(0, 7) : '';
}

function viewKey() {
  return `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}`;
}

let toastTimer;
function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2400);
}

function updateStats() {
  const now    = new Date();
  const curKey = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
  const total  = expenses.reduce((s, e) => s + e.amount, 0);
  const month  = expenses.filter(e => monthKey(e.date) === curKey).reduce((s, e) => s + e.amount, 0);
  const avg    = expenses.length ? Math.round(total / expenses.length) : 0;

  document.getElementById('total-amount').textContent      = '₹' + total.toLocaleString('en-IN');
  document.getElementById('month-amount').textContent      = '₹' + month.toLocaleString('en-IN');
  document.getElementById('transaction-count').textContent = expenses.length;
  document.getElementById('avg-amount').textContent        = '₹' + avg.toLocaleString('en-IN');
  document.getElementById('current-month').textContent     = now.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });

  const budget = parseFloat(document.getElementById('budget-input').value) || 0;
  const fill   = document.getElementById('bar-fill');
  const pct    = document.getElementById('budget-pct');

  if (budget > 0) {
    const p = Math.min((month / budget) * 100, 100);
    fill.style.width = p + '%';
    fill.classList.toggle('warn',   p >= 60 && p < 85);
    fill.classList.toggle('danger', p >= 85);
    pct.textContent  = Math.round(p) + '%';
    pct.style.color  = p >= 85 ? '#e07070' : p >= 60 ? '#f39c12' : '#555';
  } else {
    fill.style.width = '0%';
    pct.textContent  = '—';
    pct.style.color  = '#555';
  }
}

function updateChart() {
  const vk       = viewKey();
  const filtered = expenses.filter(e => monthKey(e.date) === vk);
  const ci       = document.getElementById('chart-inner');

  if (filtered.length === 0) {
    if (chartInst) { chartInst.destroy(); chartInst = null; }
    ci.innerHTML = '<p id="no-chart-msg">No expenses for this month</p>';
    return;
  }

  const totals = {};
  filtered.forEach(e => { totals[e.category] = (totals[e.category] || 0) + e.amount; });

  const cats       = Object.keys(totals);
  const vals       = cats.map(c => totals[c]);
  const colors     = cats.map(c => CATEGORY_META[c]?.color || '#999');
  const grandTotal = vals.reduce((s, v) => s + v, 0);

  const legendHTML = cats.map((c, i) => `
    <div class="legend-item">
      <div class="legend-dot" style="background:${colors[i]}"></div>
      <span class="legend-name">${CATEGORY_META[c]?.icon || ''} ${c}</span>
      <span class="legend-amount">₹${vals[i].toLocaleString('en-IN')} · ${Math.round(vals[i]/grandTotal*100)}%</span>
    </div>
  `).join('');

  if (!document.getElementById('pie-chart')) {
    ci.innerHTML = `<canvas id="pie-chart" width="200" height="200"></canvas><div class="chart-legend" id="chart-legend"></div>`;
  }
  document.getElementById('chart-legend').innerHTML = legendHTML;

  const ctx = document.getElementById('pie-chart').getContext('2d');
  if (chartInst) chartInst.destroy();

  chartInst = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: cats,
      datasets: [{
        data: vals,
        backgroundColor: colors,
        borderWidth: 2,
        borderColor: '#fff',
        hoverBorderColor: '#fff',
        hoverOffset: 6,
      }]
    },
    options: {
      cutout: '60%',
      animation: { animateRotate: true, duration: 500 },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: ctx => ` ₹${ctx.parsed.toLocaleString('en-IN')}  (${Math.round(ctx.parsed/grandTotal*100)}%)`
          }
        }
      }
    }
  });
}

function getFiltered() {
  let list = [...expenses];
  if (activeFilter !== 'All') list = list.filter(e => e.category === activeFilter);
  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    list = list.filter(e => e.name.toLowerCase().includes(q) || e.category.toLowerCase().includes(q));
  }
  switch (activeSort) {
    case 'date-desc': list.sort((a, b) => b.date.localeCompare(a.date)); break;
    case 'date-asc':  list.sort((a, b) => a.date.localeCompare(b.date)); break;
    case 'amt-desc':  list.sort((a, b) => b.amount - a.amount); break;
    case 'amt-asc':   list.sort((a, b) => a.amount - b.amount); break;
  }
  return list;
}

function escHtml(str) {
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

function renderList() {
  const list      = getFiltered();
  const container = document.getElementById('expense-list');

  if (list.length === 0) {
    container.innerHTML = `<p id="empty-msg">${
      searchQuery || activeFilter !== 'All' ? 'No matching expenses found.' : 'No expenses yet. Add one above!'
    }</p>`;
    return;
  }

  container.innerHTML = list.map(e => {
    const meta = CATEGORY_META[e.category] || { icon: '📦', color: '#999' };
    return `
      <div class="expense-item" data-id="${e.id}">
        <div class="exp-left">
          <div class="exp-icon" style="background:${meta.color}18">${meta.icon}</div>
          <div>
            <div class="exp-name">${escHtml(e.name)}</div>
            <div class="exp-meta">${e.category} · ${fmtDate(e.date)}</div>
          </div>
        </div>
        <div class="exp-right">
          <span class="exp-amount">₹${e.amount.toLocaleString('en-IN')}</span>
          <button class="exp-delete" onclick="deleteExpense('${e.id}')">✕</button>
        </div>
      </div>
    `;
  }).join('');
}

function addExpense(name, amount, category, date) {
  if (!name.trim())                             { toast('⚠️ Please enter a description'); return false; }
  if (!amount || isNaN(amount) || +amount <= 0) { toast('⚠️ Please enter a valid amount'); return false; }
  if (!date)                                    { toast('⚠️ Please select a date'); return false; }

  expenses.unshift({
    id: Date.now().toString(36) + Math.random().toString(36).slice(2),
    name: name.trim(),
    amount: +amount,
    category,
    date,
    createdAt: Date.now()
  });

  save();
  refresh();
  toast(`✅ Added ₹${(+amount).toLocaleString('en-IN')} · ${name.trim()}`);
  return true;
}

function deleteExpense(id) {
  const exp = expenses.find(e => e.id === id);
  expenses  = expenses.filter(e => e.id !== id);
  save();
  refresh();
  if (exp) toast(`🗑 Removed "${exp.name}"`);
}

function refresh() {
  updateStats();
  updateChart();
  renderList();
}

function exportCSV() {
  if (!expenses.length) { toast('No expenses to export'); return; }
  const rows = [['Date', 'Description', 'Category', 'Amount (₹)']];
  expenses.forEach(e => rows.push([e.date, e.name, e.category, e.amount]));
  const csv  = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `expenses_${todayStr()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  toast('📥 CSV downloaded!');
}

function updateMonthDisplay() {
  document.getElementById('month-display').textContent =
    new Date(viewYear, viewMonth, 1).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
}

document.getElementById('prev-month').addEventListener('click', () => {
  viewMonth--;
  if (viewMonth < 0) { viewMonth = 11; viewYear--; }
  updateMonthDisplay();
  updateChart();
});

document.getElementById('next-month').addEventListener('click', () => {
  viewMonth++;
  if (viewMonth > 11) { viewMonth = 0; viewYear++; }
  updateMonthDisplay();
  updateChart();
});

document.getElementById('add-btn').addEventListener('click', () => {
  const ok = addExpense(
    document.getElementById('expense-name').value,
    document.getElementById('expense-amount').value,
    document.getElementById('expense-category').value,
    document.getElementById('expense-date').value
  );
  if (ok) {
    document.getElementById('expense-name').value   = '';
    document.getElementById('expense-amount').value = '';
    document.getElementById('expense-name').focus();
  }
});

['expense-name', 'expense-amount'].forEach(id => {
  document.getElementById(id).addEventListener('keydown', e => {
    if (e.key === 'Enter') document.getElementById('add-btn').click();
  });
});

document.getElementById('filter-buttons').addEventListener('click', e => {
  const btn = e.target.closest('.filter-btn');
  if (!btn) return;
  document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  activeFilter = btn.dataset.filter;
  renderList();
});

document.querySelectorAll('.sort-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.sort-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    activeSort = btn.dataset.sort;
    renderList();
  });
});

document.getElementById('search-input').addEventListener('input', e => {
  searchQuery = e.target.value;
  renderList();
});

document.getElementById('export-btn').addEventListener('click', exportCSV);

document.getElementById('clear-btn').addEventListener('click', () => {
  if (!expenses.length) { toast('Nothing to clear'); return; }
  if (!confirm(`Delete all ${expenses.length} expense(s)? This cannot be undone.`)) return;
  expenses = [];
  save();
  refresh();
  toast('🗑 All expenses cleared');
});

document.getElementById('budget-input').addEventListener('input', e => {
  localStorage.setItem(BUDGET_KEY, e.target.value);
  updateStats();
});

document.getElementById('quick-chips').addEventListener('click', e => {
  const chip = e.target.closest('.chip');
  if (!chip) return;
  addExpense(
    chip.dataset.name,
    chip.dataset.amt,
    chip.dataset.cat,
    document.getElementById('expense-date').value || todayStr()
  );
});

(function init() {
  load();
  document.getElementById('expense-date').value = todayStr();
  const savedBudget = localStorage.getItem(BUDGET_KEY);
  if (savedBudget) document.getElementById('budget-input').value = savedBudget;
  const now = new Date();
  viewYear  = now.getFullYear();
  viewMonth = now.getMonth();
  updateMonthDisplay();
  refresh();
})();
