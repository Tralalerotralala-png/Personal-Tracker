// Full-screen sign-in: email -> 6-digit code (or tap the emailed link).
import { h } from './dom.js';
import { glyphSvg } from './pixel-icon.js';

export function createLogin({ auth }) {
  const email = h('input', { type: 'email', id: 'lg-email', autocomplete: 'email', inputmode: 'email', placeholder: 'you@example.com', required: true });
  const code = h('input', { type: 'text', id: 'lg-code', inputmode: 'numeric', autocomplete: 'one-time-code', placeholder: '6-digit code', maxlength: 8 });
  const msg = h('p', { class: 'form-error', role: 'alert' });
  const info = h('p', { class: 'hint' });
  const codeRow = h('div', { class: 'code-row', hidden: true },
    h('label', { for: 'lg-code' }, 'Code from the email'), code,
    h('button', { class: 'btn primary wide', type: 'button', onclick: verify }, 'Sign in'));
  const sendBtn = h('button', { class: 'btn primary wide', type: 'button', onclick: send }, 'Email me a code');

  async function send() {
    msg.textContent = '';
    const value = email.value.trim();
    if (!value) { msg.textContent = 'Enter your email address.'; email.focus(); return; }
    sendBtn.disabled = true;
    try {
      await auth.sendMagicLink(value);
      info.textContent = 'Check your email. In the home-screen app, type the 6-digit code. In a browser you can tap the link instead.';
      codeRow.hidden = false;
      sendBtn.textContent = 'Send another code';
      code.focus();
    } catch (err) {
      msg.textContent = err.message || 'Could not send the email.';
    } finally { sendBtn.disabled = false; }
  }

  async function verify() {
    msg.textContent = '';
    try { await auth.verifyCode(email.value.trim(), code.value); }
    catch (err) { msg.textContent = err.message || 'That code did not work. Request a new one.'; }
  }

  const el = h('div', { class: 'login', role: 'dialog', 'aria-label': 'Sign in' },
    h('form', { class: 'login-card', onsubmit: (e) => { e.preventDefault(); if (!codeRow.hidden && code.value) verify(); else send(); } },
      h('span', { class: 'login-glyph', html: glyphSvg('pack') }),
      h('h1', {}, 'Personal Tracker'),
      h('p', { class: 'hint' }, 'Sign in to open your pack on this device.'),
      h('label', { for: 'lg-email' }, 'Email'), email,
      sendBtn, info, codeRow, msg));
  return { el };
}
