const typeInto = (t, s, text) =>
  t.eval(`(() => { const el = document.querySelector(${JSON.stringify(s)}); el.focus(); el.setSelectionRange(0, el.value.length); document.execCommand('insertText', false, ${JSON.stringify(text)}); })()`)
const clickText = (t, text) =>
  t.eval(`(() => { const b = [...document.querySelectorAll('button')].find(x => x.textContent.includes(${JSON.stringify(text)})); if (b) { b.click(); return true; } return false; })()`)
const navTo = (t, text) =>
  t.eval(`(() => {
    const a = [...document.querySelectorAll('a')].find(x => x.textContent.includes(${JSON.stringify(text)}));
    if (a) { a.click(); return true; }
    return false;
  })()`)

module.exports = async (t) => {
  await t.wait(1000)
  await typeInto(t, 'input[placeholder="Name"]', "Ivy")
  await t.wait(150)
  await clickText(t, "Add child")
  await t.wait(600)
  await clickText(t, "Done — open Lulla")
  await t.wait(1800)

  const targets = ["Sleep", "Feeding", "Diaper", "Routine", "Mom", "Growth", "Trends", "Guides"]
  for (const label of targets) {
    await navTo(t, label)
    await t.wait(800)
    const hash = await t.eval("location.hash")
    const body = await t.eval("document.body.innerText")
    t.check(label + " page loads", body.length > 120, `hash=${hash} len=${body.length} | ${body.split("\n").slice(0, 6).join(" / ")}`)
  }
  await t.eval(`(() => { const b = document.querySelector('[aria-label="Settings"]'); if (b) b.click(); })()`)
  await t.wait(800)
  const body = await t.eval("document.body.innerText")
  t.check("Settings page loads", body.length > 120, `hash=${await t.eval("location.hash")} len=${body.length} | ${body.split("\n").slice(0, 6).join(" / ")}`)
}