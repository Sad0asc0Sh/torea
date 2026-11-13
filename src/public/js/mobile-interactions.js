/**
 * ============================================================================
 * Mobile Interactions - PWA Native Feel
 * ============================================================================
 * تعاملات موبایل با حس Native
 */

// Touch Ripple Effect
document.addEventListener('click', function(e) {
  const target = e.target.closest('.card--interactive, .btn');
  if (!target) return;
  
  const ripple = document.createElement('span');
  const rect = target.getBoundingClientRect();
  const size = Math.max(rect.width, rect.height);
  const x = e.clientX - rect.left - size / 2;
  const y = e.clientY - rect.top - size / 2;
  
  ripple.style.cssText = `
    position: absolute;
    border-radius: 50%;
    background: rgba(255,255,255,0.5);
    width: ${size}px;
    height: ${size}px;
    left: ${x}px;
    top: ${y}px;
    animation: ripple 0.6s ease-out;
    pointer-events: none;
    z-index: 1;
  `;
  
  target.appendChild(ripple);
  
  // Remove ripple after animation completes
  ripple.addEventListener('animationend', function() {
    ripple.remove();
  });
});

// Add ripple animation
const style = document.createElement('style');
style.textContent = `
  @keyframes ripple {
    0% {
      transform: scale(0);
      opacity: 1;
    }
    100% {
      transform: scale(4);
      opacity: 0;
    }
  }
`;
document.head.appendChild(style);

// Haptic Feedback
function haptic(type = 'light') {
  if ('vibrate' in navigator) {
    const patterns = {
      light: [10],
      medium: [20],
      heavy: [30]
    };
    navigator.vibrate(patterns[type]);
  }
}

// Snackbar
function showSnackbar(message, duration = 3000) {
  const snackbar = document.createElement('div');
  snackbar.className = 'snackbar';
  snackbar.innerHTML = `<span>${message}</span>`;
  document.body.appendChild(snackbar);
  
  setTimeout(() => snackbar.classList.add('snackbar--visible'), 10);
  setTimeout(() => {
    snackbar.classList.remove('snackbar--visible');
    setTimeout(() => snackbar.remove(), 300);
  }, duration);
}

// Pull to Refresh
let startY = 0;
const pullThreshold = 80;

const appContent = document.querySelector('.app-content');
if (appContent) {
  appContent.addEventListener('touchstart', (e) => {
    if (appContent.scrollTop === 0) {
      startY = e.touches[0].pageY;
    }
  }, { passive: true });

  appContent.addEventListener('touchmove', (e) => {
    if (startY === 0) return;
    
    const currentY = e.touches[0].pageY;
    const pullDistance = currentY - startY;
    
    // Basic pull-to-refresh detection
    if (pullDistance > pullThreshold && appContent.scrollTop === 0) {
      // Trigger refresh - apps can listen for 'pull-to-refresh' event
      const refreshEvent = new CustomEvent('pull-to-refresh');
      window.dispatchEvent(refreshEvent);
    }
  }, { passive: true });

  appContent.addEventListener('touchend', () => {
    startY = 0;
  }, { passive: true });
}

// Add haptic to buttons
document.querySelectorAll('.btn').forEach(btn => {
  btn.addEventListener('click', () => haptic('light'));
});

// Export functions for global use
window.MobileInteractions = {
  haptic,
  showSnackbar
};
