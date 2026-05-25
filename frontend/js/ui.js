/**
 * ui.js — keyboard shortcuts
 * Space = capture & predict
 * Backspace = delete last letter
 */
document.addEventListener('keydown', e => {
  if (e.code === 'Space' && document.activeElement.tagName !== 'INPUT') {
    e.preventDefault();
    const btn = document.getElementById('btn-capture');
    if (btn && !btn.disabled) btn.click();
  }
  if (e.code === 'Backspace' && document.activeElement.tagName !== 'INPUT') {
    e.preventDefault();
    document.getElementById('btn-delete')?.click();
  }
});