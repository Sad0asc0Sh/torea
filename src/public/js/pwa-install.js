/**
 * ============================================================================
 * PWA Install Prompt
 * ============================================================================
 * مدیریت نصب PWA
 */

let deferredPrompt;

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  
  // Show install button
  const installBtn = document.createElement('button');
  installBtn.className = 'fab';
  installBtn.innerHTML = '📱';
  installBtn.setAttribute('aria-label', 'نصب اپلیکیشن');
  installBtn.title = 'نصب اپلیکیشن';
  
  installBtn.onclick = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      
      if (outcome === 'accepted') {
        console.log('User accepted the install prompt');
      } else {
        console.log('User dismissed the install prompt');
      }
      
      deferredPrompt = null;
      installBtn.remove();
    }
  };
  
  document.body.appendChild(installBtn);
});

// Handle successful installation
window.addEventListener('appinstalled', () => {
  console.log('PWA was installed');
  deferredPrompt = null;
  
  // Remove FAB if it exists
  const fab = document.querySelector('.fab');
  if (fab) fab.remove();
});
