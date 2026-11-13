/**
 * Service Worker Update Notifier
 * Checks for updates and notifies users
 */

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.ready.then(registration => {
    // Check for updates every 5 minutes (less aggressive)
    setInterval(() => {
      registration.update().catch(() => {});
    }, 300000);
    
    // Listen for updates
    registration.addEventListener('updatefound', () => {
      const newWorker = registration.installing;
      
      newWorker.addEventListener('statechange', () => {
        if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
          console.log('[SW] New version available');
          
          // Show notification to user (optional)
          if (window.MobileInteractions && window.MobileInteractions.showSnackbar) {
            window.MobileInteractions.showSnackbar(
              '✨ نسخه جدید آماده است',
              3000
            );
          }
        }
      });
    });
  }).catch(err => {
    console.log('[SW] Service Worker registration not ready:', err);
  });
}
