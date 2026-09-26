// Theme toggle on the onboarding screen.
//
// The toggle has to work on a *fresh* device, where the settings row does not
// exist yet (it is only created when onboarding finishes). A toggle that
// spreads a not-yet-created row persists nothing and looks fine until you
// reload, so this asserts the stored preference explicitly and re-checks it
// after a reload rather than trusting the class on <html> alone.

const readStoredTheme = `(async () => {
  const o = await new Promise((res, rej) => { const rq = indexedDB.open('lulla'); rq.onsuccess = () => res(rq.result); rq.onerror = () => rej(rq.error); });
  const q = o.transaction('settings', 'readonly').objectStore('settings').getAll();
  const rows = await new Promise((res, rej) => { q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); });
  return rows.length ? (rows[0].theme || null) : null;
})()`;

const isDark = `document.documentElement.classList.contains('dark')`;

module.exports = async (t) => {
  // -- Fresh profile lands on onboarding, with the toggle already present. --
  await t.wait(1200);
  const onOnboarding = await t.eval(`document.body.innerText.includes('First, add a child') || document.body.innerText.includes('Add a child')`);
  t.check("on onboarding", !!onOnboarding);

  const hasToggle = await t.eval(`!!document.querySelector('button[aria-label="Dark theme"]')`);
  t.check("theme toggle present on onboarding", !!hasToggle);

  // -- Before clicking: resolved theme should still follow the OS, because
  //    nothing has been stored yet on a first run. --
  const before = await t.eval(isDark);
  const sysDark = await t.eval("window.matchMedia('(prefers-color-scheme: dark)').matches");
  t.check("follows system preference before any choice", before === sysDark, `dark=${before} sysDark=${sysDark}`);
  t.check("no stored theme before clicking", (await t.evalAsync(readStoredTheme)) === null);

  // -- Click it. --
  await t.eval(`document.querySelector('button[aria-label="Dark theme"]').click()`);
  await t.wait(700);

  const after = await t.eval(isDark);
  t.check("dark class flipped", after === !before, `before=${before} after=${after}`);

  const pressed = await t.eval(`document.querySelector('button[aria-label="Dark theme"]').getAttribute('aria-pressed')`);
  t.check("aria-pressed tracks state", String(after) === String(pressed), `dark=${after} aria-pressed=${pressed}`);

  // -- The choice must be persisted, not just painted. --
  const stored = await t.evalAsync(readStoredTheme);
  t.check("theme persisted to the settings row", stored === (after ? 'dark' : 'light'), `stored=${stored}`);

  // -- And it must survive a reload, which is where a toggle that only mutated
  //    the DOM (or wrote to a row that did not exist) would fall apart. --
  await t.reload();
  const afterReload = await t.eval(isDark);
  t.check("theme survives reload", afterReload === after, `before reload=${after} after reload=${afterReload}`);

  // -- The onboarding form must still work after toggling. --
  const nameStillThere = await t.eval(`!!document.querySelector('input[placeholder="Name"]')`);
  t.check("onboarding form intact", !!nameStillThere);

  await t.shot("onboarding-theme.png");
};
