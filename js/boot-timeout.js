// A failed module import previously left an unhelpful blank Loading screen.
setTimeout(() => {
  const root=document.getElementById('app');
  if (root && root.textContent.trim()==='Loading...') {
    const note=document.createElement('p');
    note.style.cssText='padding:24px;font-family:monospace;line-height:1.6';
    note.textContent='Personal Tracker is taking longer than expected to start. Refresh the page (Ctrl+Shift+R); if it continues, open Developer Tools > Console.';
    root.replaceChildren(note);
  }
},12000);
