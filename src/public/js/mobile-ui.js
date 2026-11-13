/**
 * Mobile UI - Hamburger Menu & Drawer
 * Minimal JavaScript for drawer menu functionality
 */

(function() {
  'use strict';
  
  // Wait for DOM to be ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
  
  function init() {
    const hamburgerBtn = document.getElementById('hamburger-btn');
    const drawer = document.getElementById('drawer');
    const drawerOverlay = document.getElementById('drawer-overlay');
    const drawerClose = document.getElementById('drawer-close');
    const desktopQuery = window.matchMedia('(min-width: 992px)');
    
    if (!hamburgerBtn || !drawer || !drawerOverlay) {
      // No drawer on this page
      return;
    }
    
    function syncOverflow() {
      if (drawer.classList.contains('active')) {
        document.body.style.overflow = desktopQuery.matches ? '' : 'hidden';
      } else {
        document.body.style.overflow = '';
      }
    }
    
    // Open drawer
    function openDrawer() {
      drawer.classList.add('active');
      drawerOverlay.classList.add('active');
      document.body.classList.add('drawer-open');
      syncOverflow();
    }
    
    // Close drawer
    function closeDrawer() {
      drawer.classList.remove('active');
      drawerOverlay.classList.remove('active');
      document.body.classList.remove('drawer-open');
      syncOverflow();
    }
    
    // Event listeners
    hamburgerBtn.addEventListener('click', function() {
      if (drawer.classList.contains('active')) {
        closeDrawer();
      } else {
        openDrawer();
      }
    });
    drawerOverlay.addEventListener('click', closeDrawer);
    
    if (drawerClose) {
      drawerClose.addEventListener('click', closeDrawer);
    }
    
    // Close on Escape key
    document.addEventListener('keydown', function(e) {
      if (e.key === 'Escape' && drawer.classList.contains('active')) {
        closeDrawer();
      }
    });

    desktopQuery.addEventListener('change', syncOverflow);
  }
})();
