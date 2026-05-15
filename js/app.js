/**
 * Expense & Budget Visualizer
 * Vanilla JS — no frameworks, no backend.
 * Data persisted via localStorage.
 *
 * Features:
 *  1. Add / delete transactions
 *  2. Custom categories (add / remove, emoji + color)
 *  3. Monthly summary view with category breakdown
 *  4. Sort transactions (date, amount, category)
 *  5. Spend-limit highlight
 *  6. Dark / light mode toggle (persists + respects system pref)
 */

'use strict';

// ============================================================
// Storage Keys
// ============================================================

const KEY_TRANSACTIONS = 'budget_tracker_transactions';
const KEY_CATEGORIES   = 'budget_tracker_categories';
const KEY_SETTINGS     = 'budget_tracker_settings';

// ============================================================
// Built-in Categories (cannot be deleted)
// ============================================================

const BUILTIN_CATEGORIES = [
  { name: 'Food',      emoji: '🍔', color: '#f97316', builtin: true },
  { name: 'Transport', emoji: '🚌', color: '#3b82f6', builtin: true },
  { name: 'Fun',       emoji: '🎉', color: '#a855f7', builtin: true },
];

// ============================================================
// State
// ============================================================

/** @type {{ id:string, name:string, amount:number, category:string, isoDate:string, date:string }[]} */
let transactions = [];

/** @type {{ name:string, emoji:string, color:string, builtin?:boolean }[]} */
let categories = [];

/** @type {{ theme:'light'|'dark', spendLimit:number, sortOrder:string }} */
let settings = { theme: 'light', spendLimit: 0, sortOrder: 'date-desc' };

/** @type {Chart|null} */
let chartInstance = null;

/** Currently viewed month for summary: { year:number, month:number (0-based) } */
let summaryDate = { year: new Date().getFullYear(), month: new Date().getMonth() };

// ============================================================
// LocalStorage Helpers
// ============================================================

function loadAll() {
  try {
    transactions = JSON.parse(localStorage.getItem(KEY_TRANSACTIONS) || '[]');
  } catch { transactions = []; }

  try {
    const saved = JSON.parse(localStorage.getItem(KEY_CATEGORIES) || '[]');
    // Merge: always keep builtins at front, append custom ones
    const customOnly = saved.filter(c => !c.builtin);
    categories = [...BUILTIN_CATEGORIES, ...customOnly];
  } catch {
    categories = [...BUILTIN_CATEGORIES];
  }

  try {
    const s = JSON.parse(localStorage.getItem(KEY_SETTINGS) || '{}');
    settings = { theme: 'light', spendLimit: 0, sortOrder: 'date-desc', ...s };
  } catch { /* keep defaults */ }
}

function saveTransactions() { localStorage.setItem(KEY_TRANSACTIONS, JSON.stringify(transactions)); }
function saveCategories()   {
  // Only persist custom categories
  const custom = categories.filter(c => !c.builtin);
  localStorage.setItem(KEY_CATEGORIES, JSON.stringify(custom));
}
function saveSettings()     { localStorage.setItem(KEY_SETTINGS, JSON.stringify(settings)); }

// ============================================================
// Utilities
// ============================================================

function generateId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function formatCurrency(amount) {
  return 'Rp ' + Number(amount).toLocaleString('id-ID');
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function getCategoryConfig(name) {
  return categories.find(c => c.name === name) || { emoji: '💸', color: '#94a3b8' };
}

/** Returns YYYY-MM string for a Date */
function toYearMonth(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** Returns YYYY-MM string for summaryDate */
function currentSummaryKey() {
  return `${summaryDate.year}-${String(summaryDate.month + 1).padStart(2, '0')}`;
}

// ============================================================
// DOM References
// ============================================================

// Form
const form           = document.getElementById('transactionForm');
const itemNameInput  = document.getElementById('itemName');
const amountInput    = document.getElementById('amount');
const categorySelect = document.getElementById('category');
const nameError      = document.getElementById('nameError');
const amountError    = document.getElementById('amountError');
const categoryError  = document.getElementById('categoryError');

// Header
const totalBalanceEl = document.getElementById('totalBalance');
const limitCard      = document.getElementById('limitCard');
const limitDisplay   = document.getElementById('limitDisplay');
const limitStatus    = document.getElementById('limitStatus');
const themeToggle    = document.getElementById('themeToggle');
const themeIcon      = document.getElementById('themeIcon');

// Categories panel
const categoryToggle = document.getElementById('categoryToggle');
const categoryBody   = document.getElementById('categoryBody');
const categoryChips  = document.getElementById('categoryChips');
const newCatEmoji    = document.getElementById('newCatEmoji');
const newCatName     = document.getElementById('newCatName');
const newCatColor    = document.getElementById('newCatColor');
const addCategoryBtn = document.getElementById('addCategoryBtn');
const catFormError   = document.getElementById('catFormError');

// Spend limit panel
const limitToggle  = document.getElementById('limitToggle');
const limitBody    = document.getElementById('limitBody');
const limitInput   = document.getElementById('limitInput');
const setLimitBtn  = document.getElementById('setLimitBtn');
const clearLimitBtn= document.getElementById('clearLimitBtn');

// Monthly summary panel
const summaryToggle = document.getElementById('summaryToggle');
const summaryBody   = document.getElementById('summaryBody');
const prevMonthBtn  = document.getElementById('prevMonth');
const nextMonthBtn  = document.getElementById('nextMonth');
const monthLabel    = document.getElementById('monthLabel');
const summaryTotal  = document.getElementById('summaryTotal');
const summaryList   = document.getElementById('summaryList');
const summaryEmpty  = document.getElementById('summaryEmpty');

// List
const transactionList = document.getElementById('transactionList');
const listEmpty       = document.getElementById('listEmpty');
const sortSelect      = document.getElementById('sortSelect');

// Chart
const chartCanvas = document.getElementById('spendingChart');
const chartEmpty  = document.getElementById('chartEmpty');

// ============================================================
// Theme
// ============================================================

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  themeIcon.textContent = theme === 'dark' ? '☀️' : '🌙';
  settings.theme = theme;

  // Update chart text colors if chart exists
  if (chartInstance) {
    const textColor = theme === 'dark' ? '#f1f5f9' : '#1e293b';
    chartInstance.options.plugins.legend.labels.color = textColor;
    chartInstance.update();
  }
}

themeToggle.addEventListener('click', () => {
  const next = settings.theme === 'dark' ? 'light' : 'dark';
  applyTheme(next);
  saveSettings();
});

function initTheme() {
  // Respect saved preference; fall back to system preference
  if (settings.theme) {
    applyTheme(settings.theme);
  } else {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    applyTheme(prefersDark ? 'dark' : 'light');
  }
}

// ============================================================
// Collapsible Panels
// ============================================================

function setupCollapsible(toggleBtn, body) {
  toggleBtn.addEventListener('click', () => {
    const isOpen = body.classList.toggle('open');
    toggleBtn.setAttribute('aria-expanded', String(isOpen));
  });
}

// ============================================================
// Category Select (in form)
// ============================================================

function populateCategorySelect() {
  const current = categorySelect.value;
  categorySelect.innerHTML = '<option value="">-- Select category --</option>';
  categories.forEach(c => {
    const opt = document.createElement('option');
    opt.value = c.name;
    opt.textContent = `${c.emoji} ${c.name}`;
    categorySelect.appendChild(opt);
  });
  // Restore selection if still valid
  if (categories.find(c => c.name === current)) {
    categorySelect.value = current;
  }
}

// ============================================================
// Category Chips (manage panel)
// ============================================================

function renderCategoryChips() {
  categoryChips.innerHTML = '';
  categories.forEach(c => {
    const chip = document.createElement('div');
    chip.className = `category-chip${c.builtin ? ' builtin' : ''}`;

    chip.innerHTML = `
      <span class="chip-dot" style="background:${escapeHtml(c.color)}"></span>
      <span>${escapeHtml(c.emoji)} ${escapeHtml(c.name)}</span>
      <button class="chip-delete" aria-label="Remove ${escapeHtml(c.name)}" data-name="${escapeHtml(c.name)}">✕</button>
    `;
    categoryChips.appendChild(chip);
  });

  categoryChips.querySelectorAll('.chip-delete').forEach(btn => {
    btn.addEventListener('click', () => removeCategory(btn.dataset.name));
  });
}

function removeCategory(name) {
  // Guard: don't remove builtins
  if (BUILTIN_CATEGORIES.find(c => c.name === name)) return;
  categories = categories.filter(c => c.name !== name);
  saveCategories();
  populateCategorySelect();
  renderCategoryChips();
  render(); // chart colors may change
}

addCategoryBtn.addEventListener('click', () => {
  const emoji = newCatEmoji.value.trim() || '🏷️';
  const name  = newCatName.value.trim();
  const color = newCatColor.value;

  catFormError.classList.remove('visible');
  catFormError.textContent = '';

  if (!name) {
    catFormError.textContent = 'Please enter a category name.';
    catFormError.classList.add('visible');
    return;
  }
  if (categories.find(c => c.name.toLowerCase() === name.toLowerCase())) {
    catFormError.textContent = 'A category with that name already exists.';
    catFormError.classList.add('visible');
    return;
  }

  categories.push({ name, emoji, color, builtin: false });
  saveCategories();
  populateCategorySelect();
  renderCategoryChips();

  // Reset inputs
  newCatEmoji.value = '';
  newCatName.value  = '';
  newCatColor.value = '#10b981';
});

// ============================================================
// Spend Limit
// ============================================================

function renderLimitHeader() {
  if (!settings.spendLimit) {
    limitCard.style.display = 'none';
    return;
  }
  limitCard.style.display = '';
  limitDisplay.textContent = formatCurrency(settings.spendLimit);

  const monthKey = toYearMonth(new Date());
  const monthTotal = transactions
    .filter(t => t.isoDate && t.isoDate.startsWith(monthKey))
    .reduce((s, t) => s + t.amount, 0);

  const remaining = settings.spendLimit - monthTotal;
  if (remaining < 0) {
    limitStatus.textContent = `Over by ${formatCurrency(Math.abs(remaining))}`;
    limitStatus.style.color = '#fca5a5';
  } else {
    limitStatus.textContent = `${formatCurrency(remaining)} left`;
    limitStatus.style.color = '#a7f3d0';
  }
}

setLimitBtn.addEventListener('click', () => {
  const val = parseFloat(limitInput.value);
  if (!val || val <= 0) return;
  settings.spendLimit = val;
  saveSettings();
  limitInput.value = '';
  renderLimitHeader();
  renderList(); // re-highlight
});

clearLimitBtn.addEventListener('click', () => {
  settings.spendLimit = 0;
  saveSettings();
  limitInput.value = '';
  renderLimitHeader();
  renderList();
});

// ============================================================
// Monthly Summary
// ============================================================

function renderSummary() {
  const key = currentSummaryKey();
  const MONTHS = ['January','February','March','April','May','June',
                  'July','August','September','October','November','December'];
  monthLabel.textContent = `${MONTHS[summaryDate.month]} ${summaryDate.year}`;

  const monthTx = transactions.filter(t => t.isoDate && t.isoDate.startsWith(key));
  const total   = monthTx.reduce((s, t) => s + t.amount, 0);
  summaryTotal.textContent = formatCurrency(total);

  summaryList.innerHTML = '';

  if (monthTx.length === 0) {
    summaryEmpty.classList.add('visible');
    return;
  }
  summaryEmpty.classList.remove('visible');

  // Aggregate by category
  const byCategory = {};
  monthTx.forEach(t => {
    byCategory[t.category] = (byCategory[t.category] || 0) + t.amount;
  });

  // Sort by amount desc
  const sorted = Object.entries(byCategory).sort((a, b) => b[1] - a[1]);

  sorted.forEach(([cat, amt]) => {
    const cfg  = getCategoryConfig(cat);
    const pct  = total > 0 ? (amt / total) * 100 : 0;

    const li = document.createElement('li');
    li.className = 'summary-row';
    li.innerHTML = `
      <span class="summary-emoji">${escapeHtml(cfg.emoji)}</span>
      <span class="summary-cat">${escapeHtml(cat)}</span>
      <div class="summary-bar-wrap">
        <div class="summary-bar" style="width:${pct.toFixed(1)}%;background:${escapeHtml(cfg.color)}"></div>
      </div>
      <span class="summary-amt">${formatCurrency(amt)}</span>
    `;
    summaryList.appendChild(li);
  });
}

prevMonthBtn.addEventListener('click', () => {
  summaryDate.month--;
  if (summaryDate.month < 0) { summaryDate.month = 11; summaryDate.year--; }
  renderSummary();
});

nextMonthBtn.addEventListener('click', () => {
  summaryDate.month++;
  if (summaryDate.month > 11) { summaryDate.month = 0; summaryDate.year++; }
  renderSummary();
});

// ============================================================
// Validation
// ============================================================

function validateForm() {
  let valid = true;

  const name     = itemNameInput.value.trim();
  const amount   = amountInput.value.trim();
  const category = categorySelect.value;

  setFieldError(itemNameInput,  nameError,     !name);
  setFieldError(amountInput,    amountError,   !amount || isNaN(+amount) || +amount <= 0);
  setFieldError(categorySelect, categoryError, !category);

  if (!name || !amount || isNaN(+amount) || +amount <= 0 || !category) valid = false;
  return valid;
}

function setFieldError(inputEl, errorEl, show) {
  inputEl.classList.toggle('invalid', show);
  errorEl.classList.toggle('visible', show);
}

// Clear errors on input
[itemNameInput, amountInput, categorySelect].forEach(el => {
  el.addEventListener('input', () => {
    el.classList.remove('invalid');
    // find sibling error span
    const map = { itemName: 'nameError', amount: 'amountError', category: 'categoryError' };
    const err = document.getElementById(map[el.id]);
    if (err) err.classList.remove('visible');
  });
});

// ============================================================
// Add Transaction
// ============================================================

form.addEventListener('submit', e => {
  e.preventDefault();
  if (!validateForm()) return;

  const now = new Date();
  const transaction = {
    id:       generateId(),
    name:     itemNameInput.value.trim(),
    amount:   parseFloat(amountInput.value),
    category: categorySelect.value,
    isoDate:  now.toISOString().slice(0, 10),          // YYYY-MM-DD for filtering
    date:     now.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }),
  };

  transactions.unshift(transaction);
  saveTransactions();
  render();
  form.reset();
});

// ============================================================
// Delete Transaction
// ============================================================

function deleteTransaction(id) {
  transactions = transactions.filter(t => t.id !== id);
  saveTransactions();
  render();
}

// ============================================================
// Sort Helper
// ============================================================

function getSortedTransactions() {
  const list = [...transactions];
  switch (settings.sortOrder) {
    case 'date-asc':
      return list.sort((a, b) => (a.isoDate || '').localeCompare(b.isoDate || ''));
    case 'amount-desc':
      return list.sort((a, b) => b.amount - a.amount);
    case 'amount-asc':
      return list.sort((a, b) => a.amount - b.amount);
    case 'category-asc':
      return list.sort((a, b) => a.category.localeCompare(b.category));
    case 'date-desc':
    default:
      return list.sort((a, b) => (b.isoDate || '').localeCompare(a.isoDate || ''));
  }
}

sortSelect.addEventListener('change', () => {
  settings.sortOrder = sortSelect.value;
  saveSettings();
  renderList();
});

// ============================================================
// Render: Balance
// ============================================================

function renderBalance() {
  const total = transactions.reduce((s, t) => s + t.amount, 0);
  totalBalanceEl.textContent = formatCurrency(total);
  renderLimitHeader();
}

// ============================================================
// Render: Transaction List
// ============================================================

function renderList() {
  transactionList.innerHTML = '';

  // Sync sort select UI
  sortSelect.value = settings.sortOrder;

  const sorted = getSortedTransactions();

  if (sorted.length === 0) {
    listEmpty.classList.add('visible');
    return;
  }
  listEmpty.classList.remove('visible');

  // Compute running monthly total to detect over-limit items
  const monthKey = toYearMonth(new Date());
  let runningTotal = 0;

  // We need to evaluate in chronological order for running total,
  // then render in display order.
  const chronological = [...transactions].sort((a, b) =>
    (a.isoDate || '').localeCompare(b.isoDate || '') || (a.id || '').localeCompare(b.id || '')
  );

  const overLimitIds = new Set();
  if (settings.spendLimit > 0) {
    chronological.forEach(t => {
      if (t.isoDate && t.isoDate.startsWith(monthKey)) {
        runningTotal += t.amount;
        if (runningTotal > settings.spendLimit) overLimitIds.add(t.id);
      }
    });
  }

  sorted.forEach(t => {
    const cfg = getCategoryConfig(t.category);
    const isOver = overLimitIds.has(t.id);

    const li = document.createElement('li');
    li.className = `transaction-item${isOver ? ' over-limit' : ''}`;
    li.dataset.id = t.id;

    li.innerHTML = `
      <div class="item-icon" aria-hidden="true" style="background:${hexToRgba(cfg.color, 0.12)}">${escapeHtml(cfg.emoji)}</div>
      <div class="item-details">
        <p class="item-name" title="${escapeHtml(t.name)}">${escapeHtml(t.name)}</p>
        <p class="item-category">${escapeHtml(t.category)} · ${escapeHtml(t.date)}${isOver ? ' ⚠️' : ''}</p>
      </div>
      <span class="item-amount">-${formatCurrency(t.amount)}</span>
      <button class="btn-delete" aria-label="Delete ${escapeHtml(t.name)}" data-id="${t.id}" title="Delete">✕</button>
    `;
    transactionList.appendChild(li);
  });

  transactionList.querySelectorAll('.btn-delete').forEach(btn => {
    btn.addEventListener('click', () => deleteTransaction(btn.dataset.id));
  });
}

// ============================================================
// Render: Pie Chart
// ============================================================

function renderChart() {
  const totals = {};
  transactions.forEach(t => {
    totals[t.category] = (totals[t.category] || 0) + t.amount;
  });

  const labels = Object.keys(totals);
  const data   = Object.values(totals);
  const colors = labels.map(l => getCategoryConfig(l).color || '#94a3b8');
  const isDark = settings.theme === 'dark';
  const textColor = isDark ? '#f1f5f9' : '#1e293b';

  if (labels.length === 0) {
    chartEmpty.classList.add('visible');
    chartCanvas.style.display = 'none';
    if (chartInstance) { chartInstance.destroy(); chartInstance = null; }
    return;
  }

  chartEmpty.classList.remove('visible');
  chartCanvas.style.display = 'block';

  if (chartInstance) {
    chartInstance.data.labels = labels;
    chartInstance.data.datasets[0].data            = data;
    chartInstance.data.datasets[0].backgroundColor = colors;
    chartInstance.options.plugins.legend.labels.color = textColor;
    chartInstance.update();
    return;
  }

  chartInstance = new Chart(chartCanvas, {
    type: 'pie',
    data: {
      labels,
      datasets: [{
        data,
        backgroundColor: colors,
        borderColor: isDark ? '#1e293b' : '#ffffff',
        borderWidth: 3,
        hoverOffset: 8,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      plugins: {
        legend: {
          position: 'bottom',
          labels: {
            padding: 14,
            font: { size: 12, weight: '600' },
            usePointStyle: true,
            pointStyleWidth: 10,
            color: textColor,
          },
        },
        tooltip: {
          callbacks: {
            label(ctx) {
              const total = ctx.dataset.data.reduce((a, b) => a + b, 0);
              const pct   = ((ctx.parsed / total) * 100).toFixed(1);
              return ` ${formatCurrency(ctx.parsed)} (${pct}%)`;
            },
          },
        },
      },
    },
  });
}

// ============================================================
// Master Render
// ============================================================

function render() {
  renderBalance();
  renderList();
  renderChart();
  renderSummary();
}

// ============================================================
// Color Utility
// ============================================================

/** Convert #rrggbb hex to rgba(r,g,b,a) string */
function hexToRgba(hex, alpha) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

// ============================================================
// Init
// ============================================================

(function init() {
  loadAll();
  initTheme();

  // Collapsible panels
  setupCollapsible(categoryToggle, categoryBody);
  setupCollapsible(limitToggle,    limitBody);
  setupCollapsible(summaryToggle,  summaryBody);

  // Populate category dropdown
  populateCategorySelect();

  // Populate category chips
  renderCategoryChips();

  // Pre-fill limit input if set
  if (settings.spendLimit > 0) limitInput.value = settings.spendLimit;

  // Sync sort select
  sortSelect.value = settings.sortOrder;

  render();
})();
