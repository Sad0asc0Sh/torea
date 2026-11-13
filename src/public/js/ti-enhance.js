/* TI UI Enhancements: table labels + small mobile helpers */
(function () {
  function enhanceTables() {
    var tables = document.querySelectorAll('table');
    tables.forEach(function (t) {
      // mark as ti-table if not already
      if (!t.classList.contains('ti-table')) t.classList.add('ti-table');

      var thead = t.querySelector('thead');
      if (!thead) return;
      var headers = Array.from(thead.querySelectorAll('th')).map(function (th) {
        return (th.innerText || th.textContent || '').trim();
      });
      if (!headers.length) return;

      t.querySelectorAll('tbody tr').forEach(function (tr) {
        Array.from(tr.children).forEach(function (cell, idx) {
          if (!cell || cell.nodeType !== 1) return;
          if (!cell.hasAttribute('data-label') && headers[idx]) {
            cell.setAttribute('data-label', headers[idx]);
          }
        });
      });
    });
  }

  function safeDetailsForLongTables() {
    // Optional: on desktop, keep table normal; on mobile the CSS turns it into cards.
    // Here we just ensure tables are wrapped for horizontal scroll if needed.
    document.querySelectorAll('table').forEach(function (t) {
      if (t.closest('.table-wrap')) return;
      var wrap = document.createElement('div');
      wrap.className = 'table-wrap';
      t.parentNode.insertBefore(wrap, t);
      wrap.appendChild(t);
    });
  }

  function highlightActiveDrawerLink() {
    var path = location.pathname;
    var links = document.querySelectorAll('#drawer a[href], .drawer a[href]');
    links.forEach(function (a) {
      try {
        var href = a.getAttribute('href') || '';
        if (!href || href === '#') return;
        // match start to cover subpaths
        if (href !== '/' && path.indexOf(href) === 0) {
          a.classList.add('active');
        }
      } catch (e) {}
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    try { enhanceTables(); } catch (e) {}
    try { safeDetailsForLongTables(); } catch (e) {}
    try { highlightActiveDrawerLink(); } catch (e) {}
  });
})();