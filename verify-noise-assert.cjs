module.exports = async (t) => {
  await t.eval(() => {
    const h = Array.from(document.querySelectorAll('h2')).find(x=>x.textContent.includes('Noise machine'));
    if (!h) throw new Error('missing noise machine h2');
  });
  await t.eval(() => {
    const cb = Array.from(document.querySelectorAll('input[type=checkbox]')).find(x=>x.getAttribute('aria-label')==='Noise machine on or off');
    if (!cb) throw new Error('missing checkbox');
  });
  console.log('PASS: noise machine present');
};
