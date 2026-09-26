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
  await t.wait(1200)
  await typeInto(t, 'input[placeholder="Name"]', "Ivy")
  await t.wait(150)
  await clickText(t, "Add child")
  await t.wait(600)
  await clickText(t, "Done — open Lulla")
  await t.wait(1800)

  const initialDark = await t.eval("document.documentElement.classList.contains('dark')")
  const sysDark = await t.eval("window.matchMedia('(prefers-color-scheme: dark)').matches")
  t.check("starts with system preference", initialDark === sysDark, `initDark=${initialDark} sysDark=${sysDark}`)

  await navTo(t, "Feeding")
  await t.wait(800)
  const feedBody = await t.eval("document.body.innerText")
  t.check(
    "prediction card shown",
    feedBody.includes("Next feed likely around") || feedBody.includes("Log a feeding"),
    feedBody.split("\n").slice(0, 10).join(" / "),
  )

  await t.eval(`(() => { const b = document.querySelector('[aria-label="Settings"]'); if (b) b.click(); })()`)
  await t.wait(800)
  await clickText(t, "Dark")
  await t.wait(500)

  const darkAfter = await t.eval("document.documentElement.classList.contains('dark')")
  t.check("dark class toggled", darkAfter === true)
  const bg = await t.eval("getComputedStyle(document.body).backgroundColor")
  t.check("dark body bg applied", /^rgb\(/.test(bg) && bg !== "rgb(251, 247, 240)", `bg=${bg}`)

  await clickText(t, "Light")
  await t.wait(400)
  t.check("light restored", (await t.eval("document.documentElement.classList.contains('dark')")) === false)

  await t.shot("lulla-darkmode.png")
}