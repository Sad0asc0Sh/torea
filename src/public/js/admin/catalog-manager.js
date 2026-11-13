'use strict';

// ============================================
// Constants
// ============================================

const DEBOUNCE_DELAY = 300; // ms
const TOAST_SHORT = 1500; // ms
const TOAST_DEFAULT = 3000; // ms
const ANNOUNCEMENT_DELAY = 1000; // ms

// ============================================
// Mobile Detection & Optimization
// ============================================

/**
 * Detect mobile device
 * @returns {boolean}
 */
function isMobileDevice() {
  // Check viewport width
  if (window.innerWidth <= 768) return true;
  
  // Check user agent
  const ua = navigator.userAgent || navigator.vendor || window.opera;
  const mobileRegex = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i;
  if (mobileRegex.test(ua)) return true;
  
  // Check touch support
  const hasTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  if (hasTouch && window.innerWidth <= 1024) return true;
  
  return false;
}

/**
 * Detect if device supports touch
 * @returns {boolean}
 */
function isTouchDevice() {
  return 'ontouchstart' in window || 
         navigator.maxTouchPoints > 0 || 
         navigator.msMaxTouchPoints > 0;
}

/**
 * Apply mobile-specific optimizations
 */
function applyMobileOptimizations() {
  const isMobile = isMobileDevice();
  const isTouch = isTouchDevice();
  
  // Add classes for CSS targeting
  if (isMobile) {
    document.body.classList.add('mobile-device');
    console.log('📱 Mobile device detected');
  }
  
  if (isTouch) {
    document.body.classList.add('touch-device');
  }
  
  // Default to list view on mobile (tree is harder to use)
  if (isMobile && currentView === 'tree') {
    console.log('📱 Switching to list view for mobile');
    // Delay to ensure DOM is ready
    setTimeout(() => {
      if (typeof switchView === 'function') {
        switchView('list');
      }
    }, 100);
  }
  
  // Increase toast duration on mobile
  if (isMobile && typeof TOAST_DEFAULT !== 'undefined') {
    window.TOAST_DEFAULT = 4000; // 4 seconds instead of 3
  }
  
  // Add touch event listeners for better responsiveness
  if (isTouch) {
    // Prevent double-tap zoom on buttons
    document.querySelectorAll('button, .btn, .btn-icon').forEach(btn => {
      btn.addEventListener('touchend', function(e) {
        // Prevent delay and double-tap zoom
        e.preventDefault();
        this.click();
      }, { passive: false });
    });
  }
  
  // Log device info for debugging
  console.log('📱 Device Info:', {
    mobile: isMobile,
    touch: isTouch,
    width: window.innerWidth,
    height: window.innerHeight,
    userAgent: navigator.userAgent.substring(0, 50) + '...'
  });
}

/**
 * Handle orientation change
 */
function handleOrientationChange() {
  const isMobile = isMobileDevice();
  
  if (isMobile) {
    console.log('📱 Orientation changed:', window.orientation || screen.orientation?.type);
    
    // Re-apply optimizations after orientation change
    setTimeout(() => {
      applyMobileOptimizations();
      
      // Refresh current view
      if (currentView === 'list' && typeof renderListView === 'function') {
        renderListView();
      } else if (currentView === 'kanban' && typeof renderKanbanView === 'function') {
        renderKanbanView();
      }
    }, 300);
  }
}

// ============================================
// Data Storage
// ============================================

let allItems = [];
let filteredItems = [];
let currentView = 'tree';
const edits = {};
let lastFocusedElement = null; // For modal focus management

// ============================================
// Performance Optimization
// ============================================

// Debounce utility
function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

// Store original applyFilters function
let originalApplyFilters = null;

// Debounced search
const debouncedSearch = debounce(() => {
  if (originalApplyFilters) {
    originalApplyFilters();
    checkEmptyState();
    hideLoadingSkeleton();
  }
}, DEBOUNCE_DELAY);

// ============================================
// Loading States
// ============================================

function showLoadingSkeleton() {
  const skeleton = document.getElementById('loading-skeleton');
  const form = document.getElementById('catalog-form');
  if (skeleton) skeleton.style.display = 'block';
  if (form) form.style.display = 'none';
}

function hideLoadingSkeleton() {
  const skeleton = document.getElementById('loading-skeleton');
  const form = document.getElementById('catalog-form');
  if (skeleton) skeleton.style.display = 'none';
  if (form && currentView === 'tree') form.style.display = 'block';
}

// ============================================
// Empty State
// ============================================

function checkEmptyState() {
  const isEmpty = filteredItems.length === 0;
  const emptyState = document.getElementById('empty-state');
  if (emptyState) {
    emptyState.style.display = isEmpty ? 'flex' : 'none';
  }
  
  if (currentView === 'tree') {
    const form = document.getElementById('catalog-form');
    if (form) form.style.display = isEmpty ? 'none' : 'block';
  }
}

// ============================================
// Toast Notifications
// ============================================

function showToast(message, type = 'info', duration = 3000) {
  const container = document.getElementById('toast-container');
  if (!container) return;
  
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  
  const icon = {
    success: '✅',
    error: '❌',
    warning: '⚠️',
    info: 'ℹ️',
  }[type] || 'ℹ️';
  
  toast.innerHTML = `
    <span class="toast-icon">${icon}</span>
    <span class="toast-message">${message}</span>
    <button class="toast-close" onclick="this.parentElement.remove()">×</button>
  `;
  
  container.appendChild(toast);
  
  // Animate in
  setTimeout(() => toast.classList.add('show'), 10);
  
  // Auto remove
  if (duration > 0) {
    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => toast.remove(), 300);
    }, duration);
  }
}

// ============================================
// Dark Mode
// ============================================

function toggleTheme() {
  const html = document.documentElement;
  const currentTheme = html.getAttribute('data-theme') || 'light';
  const newTheme = currentTheme === 'light' ? 'dark' : 'light';
  
  html.setAttribute('data-theme', newTheme);
  localStorage.setItem('catalog-theme', newTheme);
  
  // Update icon
  const icon = document.querySelector('.theme-icon');
  if (icon) {
    icon.textContent = newTheme === 'light' ? '🌙' : '☀️';
  }
  
  showToast(`تم ${newTheme === 'dark' ? 'تیره' : 'روشن'} فعال شد`, 'success', 2000);
}

// ============================================
// Cache Management
// ============================================

async function clearCacheAndRefresh() {
  if (!confirm('پاک کردن کش و تازهسازی؟')) return;
  
  showLoadingSkeleton();
  showToast('در حال پاک کردن کش...', 'info', 0);
  
  try {
    const response = await fetch('/admin/settings/catalog-manager/cache/clear', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
    });
    
    const data = await response.json();
    
    if (data.ok) {
      showToast('کش پاک شد، صفحه تازهسازی میشود...', 'success', TOAST_SHORT);
      setTimeout(() => window.location.reload(), TOAST_SHORT);
    } else {
      throw new Error(data.error);
    }
  } catch (err) {
    showToast('خطا در پاک کردن کش: ' + err.message, 'error');
    hideLoadingSkeleton();
  }
}

// ============================================
// Keyboard Shortcuts
// ============================================

function showKeyboardShortcuts() {
  lastFocusedElement = document.activeElement;
  const modal = document.getElementById('shortcuts-modal');
  if (modal) {
    modal.style.display = 'flex';
    
    // Focus first focusable element in modal for keyboard navigation
    setTimeout(() => {
      const firstFocusable = modal.querySelector('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
      if (firstFocusable) firstFocusable.focus();
    }, 100);
  }
}

function closeShortcutsModal() {
  const modal = document.getElementById('shortcuts-modal');
  if (modal) modal.style.display = 'none';
  
  // Return focus to element that opened the modal
  if (lastFocusedElement) {
    lastFocusedElement.focus();
    lastFocusedElement = null;
  }
}

// ============================================
// Accessibility - ARIA Live Regions
// ============================================

function announceToScreenReader(message) {
  const liveRegion = document.getElementById('aria-live-region') || createLiveRegion();
  liveRegion.textContent = message;
  
  // Clear after announcement
  setTimeout(() => {
    liveRegion.textContent = '';
  }, ANNOUNCEMENT_DELAY);
}

function createLiveRegion() {
  const region = document.createElement('div');
  region.id = 'aria-live-region';
  region.className = 'sr-only';
  region.setAttribute('role', 'status');
  region.setAttribute('aria-live', 'polite');
  region.setAttribute('aria-atomic', 'true');
  document.body.appendChild(region);
  return region;
}

// ============================================
// Selection Functions (Enhanced)
// ============================================

function selectAll() {
  document.querySelectorAll('.tree-table input[type="checkbox"]').forEach(cb => cb.checked = true);
  updateCount();
  announceToScreenReader(`همه ${allItems.length} آیتم انتخاب شدند`);
}

function selectNone() {
  document.querySelectorAll('.tree-table input[type="checkbox"]').forEach(cb => cb.checked = false);
  updateCount();
  announceToScreenReader('همه آیتمها لغو انتخاب شدند');
}

function selectNew() {
  document.querySelectorAll('.tree-table tbody tr').forEach(row => {
    const badge = row.querySelector('td:nth-child(2)').textContent.trim();
    const checkbox = row.querySelector('input[type="checkbox"]');
    checkbox.checked = badge === '🆕';
  });
  updateCount();
}

function updateCount() {
  const count = document.querySelectorAll('.tree-table input[type="checkbox"]:checked').length;
  document.getElementById('count').textContent = count;
}

function toggle(btn) {
  const row = btn.closest('tr');
  const depth = parseInt(row.dataset.depth);
  const isExpanded = btn.textContent === '▼';
  
  btn.textContent = isExpanded ? '▶' : '▼';
  
  let next = row.nextElementSibling;
  while (next) {
    const nextDepth = parseInt(next.dataset.depth);
    if (nextDepth <= depth) break;
    if (nextDepth === depth + 1) {
      next.style.display = isExpanded ? 'none' : '';
    }
    next = next.nextElementSibling;
  }
}

function expandAll() {
  document.querySelectorAll('.toggle').forEach(btn => {
    if (btn.textContent === '▶') btn.click();
  });
}

function collapseAll() {
  document.querySelectorAll('.toggle').forEach(btn => {
    if (btn.textContent === '▼') btn.click();
  });
}

function saveEdit(input) {
  const key = input.dataset.key;
  if (!edits[key]) edits[key] = {};
  edits[key].title = input.value.trim();
  document.getElementById('edits-data').value = JSON.stringify(edits);
  input.style.background = '#f0fdf4';
  setTimeout(() => input.style.background = '', 300);
}

document.getElementById('catalog-form')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  
  const count = document.querySelectorAll('input[type="checkbox"]:checked').length;
  if (count === 0) {
    showToast('لطفاً حداقل یک آیتم را انتخاب کنید', 'warning');
    return false;
  }
  
  const editCount = Object.keys(edits).length;
  let confirmMsg = `ذخیره ${count} آیتم؟`;
  if (editCount > 0) {
    confirmMsg += `\n(${editCount} ویرایش دستی)`;
  }
  
  if (!confirm(confirmMsg)) return false;
  
  // Show loading
  const submitBtn = e.target.querySelector('button[type="submit"]');
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.textContent = '⏳ در حال ذخیره...';
  }
  
  showToast('در حال ذخیره تغییرات...', 'info', 0);
  
  // Submit form
  e.target.submit();
});

updateCount();

// ============================================
// Enhanced Keyboard Shortcuts
// ============================================

document.addEventListener('keydown', (e) => {
  // Ctrl+A: Select All
  if ((e.ctrlKey || e.metaKey) && e.key === 'a') {
    if (document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA') {
      e.preventDefault();
      selectAll();
      showToast('همه انتخاب شدند', 'info', TOAST_SHORT);
    }
  }
  
  // Alt+D: Deselect All (avoid conflict with browser Ctrl+D bookmark)
  if (e.altKey && e.key === 'd') {
    e.preventDefault();
    selectNone();
    showToast('همه لغو انتخاب شدند', 'info', TOAST_SHORT);
  }
  
  // Ctrl+S: Save
  if ((e.ctrlKey || e.metaKey) && e.key === 's') {
    e.preventDefault();
    const form = document.getElementById('catalog-form');
    if (form) form.requestSubmit();
  }
  
  // Ctrl+F: Focus search
  if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
    e.preventDefault();
    document.getElementById('search-input')?.focus();
  }
  
  // Esc: Close panels
  if (e.key === 'Escape') {
    closeProperties();
    closeShortcutsModal();
  }
  
  // ?: Show shortcuts
  if (e.key === '?' && !e.ctrlKey && !e.metaKey) {
    if (document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA') {
      e.preventDefault();
      showKeyboardShortcuts();
    }
  }
});

// ============================================
// Performance Monitoring
// ============================================

if (window.performance && window.performance.mark) {
  // Mark when page loads
  window.addEventListener('load', () => {
    performance.mark('catalog-manager-loaded');
    
    const loadTime = performance.now();
    console.log(`📊 Catalog Manager loaded in ${loadTime.toFixed(2)}ms`);
    
    if (loadTime > 3000) {
      console.warn('⚠️ Slow page load detected');
    }
  });
}

// ============================================
// Initialization on Page Load
// ============================================

document.addEventListener('DOMContentLoaded', () => {
  // Load theme
  const savedTheme = localStorage.getItem('catalog-theme') || 'light';
  document.documentElement.setAttribute('data-theme', savedTheme);
  
  const icon = document.querySelector('.theme-icon');
  if (icon) {
    icon.textContent = savedTheme === 'light' ? '🌙' : '☀️';
  }
  
  // 🆕 Apply mobile optimizations FIRST
  applyMobileOptimizations();
  
  // Initialize data
  const itemsData = document.getElementById('items-data')?.value;
  if (itemsData) {
    try {
      allItems = JSON.parse(itemsData);
      filteredItems = [...allItems];
      updateFilterCounts();
      populateParentDropdown();
    } catch (e) {
      console.error('Error parsing items data:', e);
    }
  }
  
  // Setup debounced search
  const searchInput = document.getElementById('search-input');
  if (searchInput) {
    searchInput.addEventListener('input', () => {
      showLoadingSkeleton();
      debouncedSearch();
    });
    
    // 🆕 Prevent zoom on focus for iOS
    if (isMobileDevice()) {
      searchInput.addEventListener('focus', function() {
        this.style.fontSize = '16px'; // Prevent iOS zoom
      });
    }
  }
  
  // 🆕 Handle orientation change
  window.addEventListener('orientationchange', handleOrientationChange);
  window.addEventListener('resize', debounce(handleOrientationChange, 300));
});

// ============================================
// View Switching
// ============================================

function switchView(view) {
  currentView = view;
  
  // Update buttons
  document.querySelectorAll('.view-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.view === view);
  });
  
  // Show/hide views
  document.getElementById('catalog-form').style.display = view === 'tree' ? 'block' : 'none';
  document.getElementById('list-view').style.display = view === 'list' ? 'block' : 'none';
  document.getElementById('kanban-view').style.display = view === 'kanban' ? 'block' : 'none';
  
  // Render view
  if (view === 'list') renderListView();
  if (view === 'kanban') renderKanbanView();
}

// ============================================
// Filters
// ============================================

function applyFilters() {
  const searchTerm = document.getElementById('search-input')?.value.toLowerCase() || '';
  
  const statusFilters = Array.from(document.querySelectorAll('.filter-group input[value="new"], .filter-group input[value="active"], .filter-group input[value="hidden"]'))
    .filter(cb => cb.checked)
    .map(cb => cb.value);
  
  const sourceFilters = Array.from(document.querySelectorAll('.filter-group input[value="route"], .filter-group input[value="ejs"], .filter-group input[value="database"]'))
    .filter(cb => cb.checked)
    .map(cb => cb.value);
  
  const typeFilters = Array.from(document.querySelectorAll('.filter-group input[value="page"], .filter-group input[value="group"], .filter-group input[value="setting"]'))
    .filter(cb => cb.checked)
    .map(cb => cb.value);
  
  filteredItems = allItems.filter(item => {
    // Search
    if (searchTerm) {
      const title = (item.title || item.display_title || '').toLowerCase();
      const key = (item.key || '').toLowerCase();
      if (!title.includes(searchTerm) && !key.includes(searchTerm)) return false;
    }
    
    // Status
    let status = 'active';
    if (item.is_new) status = 'new';
    else if (!item.is_active) status = 'hidden';
    if (!statusFilters.includes(status)) return false;
    
    // Source
    const itemSources = item.sources || [item.source];
    if (!itemSources.some(s => sourceFilters.includes(s))) return false;
    
    // Type
    if (!typeFilters.includes(item.type)) return false;
    
    return true;
  });
  
  // Update UI
  updateTreeVisibility();
  if (currentView === 'list') renderListView();
  if (currentView === 'kanban') renderKanbanView();
  
  // Check empty state and hide loading
  checkEmptyState();
  hideLoadingSkeleton();
}

// Store original function for debounced version
originalApplyFilters = applyFilters;

function updateTreeVisibility() {
  const filteredKeys = new Set(filteredItems.map(i => i.key));
  
  document.querySelectorAll('.tree-table tbody tr').forEach(row => {
    const key = row.dataset.key;
    row.style.display = filteredKeys.has(key) ? '' : 'none';
  });
}

function resetFilters() {
  const searchInput = document.getElementById('search-input');
  if (searchInput) searchInput.value = '';
  
  document.querySelectorAll('.filter-group input[type="checkbox"]').forEach(cb => {
    cb.checked = !cb.value.includes('hidden');
  });
  applyFilters();
}

function updateFilterCounts() {
  const newCount = allItems.filter(i => i.is_new).length;
  const activeCount = allItems.filter(i => i.is_existing && i.is_active).length;
  const hiddenCount = allItems.filter(i => i.is_existing && !i.is_active).length;
  
  const newEl = document.getElementById('count-new');
  const activeEl = document.getElementById('count-active');
  const hiddenEl = document.getElementById('count-hidden');
  
  if (newEl) newEl.textContent = newCount;
  if (activeEl) activeEl.textContent = activeCount;
  if (hiddenEl) hiddenEl.textContent = hiddenCount;
}

// ============================================
// List View
// ============================================

function renderListView() {
  const tbody = document.getElementById('list-tbody');
  if (!tbody) return;
  
  tbody.innerHTML = filteredItems.map(item => {
    const checked = item.is_existing && item.is_active;
    let statusBadge = '✅ فعال';
    if (item.is_new) statusBadge = '🆕 جدید';
    else if (!item.is_active) statusBadge = '⭕ مخفی';
    
    return `
      <tr>
        <td>
          <input type="checkbox" value="${item.key}" ${checked ? 'checked' : ''}>
        </td>
        <td>${item.title || item.display_title || ''}</td>
        <td><code>${item.key}</code></td>
        <td>${item.type}</td>
        <td>${statusBadge}</td>
        <td>
          <button type="button" class="btn-icon" onclick="openProperties('${item.key}')">✏️</button>
        </td>
      </tr>
    `;
  }).join('');
}

// ============================================
// Kanban View
// ============================================

function renderKanbanView() {
  const newItems = filteredItems.filter(i => i.is_new);
  const activeItems = filteredItems.filter(i => i.is_existing && i.is_active);
  const hiddenItems = filteredItems.filter(i => i.is_existing && !i.is_active);
  
  const newCountEl = document.getElementById('kanban-new-count');
  const activeCountEl = document.getElementById('kanban-active-count');
  const hiddenCountEl = document.getElementById('kanban-hidden-count');
  
  if (newCountEl) newCountEl.textContent = newItems.length;
  if (activeCountEl) activeCountEl.textContent = activeItems.length;
  if (hiddenCountEl) hiddenCountEl.textContent = hiddenItems.length;
  
  renderKanbanColumn('kanban-new', newItems);
  renderKanbanColumn('kanban-active', activeItems);
  renderKanbanColumn('kanban-hidden', hiddenItems);
}

function renderKanbanColumn(columnId, items) {
  const column = document.getElementById(columnId);
  if (!column) return;
  
  column.innerHTML = items.map(item => `
    <div class="kanban-card" data-key="${item.key}">
      <div class="card-header">
        <span class="card-icon">${item.display_icon || item.icon || '📄'}</span>
        <span class="card-title">${item.title || item.display_title || ''}</span>
      </div>
      <div class="card-body">
        <code class="card-key">${item.key}</code>
        <span class="card-type">${item.type}</span>
      </div>
      <div class="card-footer">
        <button type="button" class="btn-icon" onclick="openProperties('${item.key}')">✏️</button>
      </div>
    </div>
  `).join('');
}

// ============================================
// Properties Panel
// ============================================

function openProperties(key) {
  const item = allItems.find(i => i.key === key);
  if (!item) return;
  
  document.getElementById('prop-key').value = key;
  document.getElementById('prop-title').value = item.title || item.display_title || '';
  document.getElementById('prop-description').value = item.description || '';
  document.getElementById('prop-icon').value = item.icon || item.display_icon || '';
  document.getElementById('prop-type').value = item.type || 'page';
  document.getElementById('prop-parent').value = item.parent_key || '';
  document.getElementById('prop-order').value = item.order_index || 0;
  
  document.getElementById('properties-panel').style.display = 'block';
}

function closeProperties() {
  document.getElementById('properties-panel').style.display = 'none';
}

function saveProperties() {
  const key = document.getElementById('prop-key').value;
  const title = document.getElementById('prop-title').value;
  const description = document.getElementById('prop-description').value;
  const icon = document.getElementById('prop-icon').value;
  const type = document.getElementById('prop-type').value;
  const parentKey = document.getElementById('prop-parent').value;
  const orderIndex = document.getElementById('prop-order').value;
  
  if (!edits[key]) edits[key] = {};
  edits[key].title = title;
  edits[key].description = description;
  edits[key].icon = icon;
  edits[key].type = type;
  edits[key].parent_key = parentKey;
  edits[key].order_index = orderIndex;
  
  document.getElementById('edits-data').value = JSON.stringify(edits);
  
  // Update UI
  const item = allItems.find(i => i.key === key);
  if (item) {
    item.title = title;
    item.icon = icon;
    item.type = type;
  }
  
  // Refresh current view
  if (currentView === 'tree') {
    const row = document.querySelector(`tr[data-key="${key}"]`);
    if (row) {
      const titleInput = row.querySelector('.title-input');
      if (titleInput) titleInput.value = title;
    }
  } else if (currentView === 'list') {
    renderListView();
  } else if (currentView === 'kanban') {
    renderKanbanView();
  }
  
  closeProperties();
  
  alert('✅ تغییرات در حافظه ذخیره شد. برای ثبت نهایی روی "اعمال تغییرات" کلیک کنید.');
}

function populateParentDropdown() {
  const select = document.getElementById('prop-parent');
  if (!select) return;
  
  const options = allItems
    .filter(i => i.type === 'group')
    .map(i => `<option value="${i.key}">${i.title || i.display_title || i.key}</option>`)
    .join('');
  
  select.innerHTML = '<option value="">-- بدون والد --</option>' + options;
}
