const typeInto = (t, s, text) =>
  t.eval(`(() => { const el = document.querySelector(${JSON.stringify(s)}); el.focus(); el.setSelectionRange(0, el.value.length); document.execCommand('insertText', false, ${JSON.stringify(text)}); })()`)
const clickText = (t, text) =>
  t.eval(`(() => { const b = [...document.querySelectorAll('button')].find(x => x.textContent.includes(${JSON.stringify(text)})); if (b) { b.click(); return true; } return false; })()`)

module.exports = async (t) => {
  await t.wait(1200)
  await typeInto(t, 'input[placeholder="Name"]', "Ivy")
  await t.wait(150)
  await clickText(t, "Add child")
  await t.wait(600)
  await clickText(t, "Done — open Lulla")
  await t.wait(1800)

  await t.eval(`(() => { const b = document.querySelector('[aria-label="Settings"]'); if (b) b.click(); })()`)
  await t.wait(800)
  const clicked = await t.eval(`(() => {
    const a = [...document.querySelectorAll('a')].find(x => x.textContent.includes('What'));
    if (!a) return false
    a.click()
    return true
  })()`)
  t.check('linked from About', clicked)
  await t.wait(1600)
  const body = await t.eval("document.body.innerText")
  t.check('changelog heading shown', body.includes('What'))
  t.check('entries listed', body.includes('next-feed prediction') || body.includes('dark mode'))
  t.check('version pins present', /\bv0\.1\.2\d+\b/.test(body))
  t.check('not showing About leftovers', !body.includes('Appearance'))
}