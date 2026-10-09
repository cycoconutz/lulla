const http = require('http');
const https = require('https');

async function main() {
  const url = 'https://lulla.dev/#/sleep';
  const {t, done} = await require('./e2e/cdp-run-real.cjs').run(url, {
    headless: true,
    width: 390,
    height: 844,
  });
  try {
    await t.eval(() => {
      const h = Array.from(document.querySelectorAll('h2')).find(x=>x.textContent.includes('Noise machine'));
      if (!h) throw new Error('missing noise machine h2');
    });
    await t.eval(() => {
      const cb = Array.from(document.querySelectorAll('input[type=checkbox]')).find(x=>x.getAttribute('aria-label')==='Noise machine on or off');
      if (!cb) throw new Error('missing checkbox');
    });
    console.log('PASS: noise machine present');
  } catch (e) {
    console.error('FAIL', e);
    process.exit(1);
  } finally {
    done();
  }
}
main();
