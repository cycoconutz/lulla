const typeInto = (t, selector, text) =>
  t.eval(`(() => {
    const el = document.querySelector(${JSON.stringify(selector)});
    el.focus();
    el.setSelectionRange(0, el.value.length);
    document.execCommand('insertText', false, ${JSON.stringify(text)});
  })()`)
const clickText = (t, text) =>
  t.eval(`(() => {
    const b = [...document.querySelectorAll('button')].find(x => x.textContent.includes(${JSON.stringify(text)}));
    if (b) { b.click(); return true; }
    return false;
  })()`)

module.exports = async (t) => {
  await t.wait(1000)
  t.check("title ok", (await t.eval("document.title")) !== "")
  t.check("brand shows", await t.text("h1") === "lulla")

  await typeInto(t, 'input[placeholder="Name"]', "Ivy")
  await t.wait(150)
  t.check("add child", await clickText(t, "Add child"))
  await t.wait(600)
  let body = await t.eval("document.body.innerText")
  t.check("child persisted", body.includes("Ivy — born"))

  t.check("open app", await clickText(t, "Done — open Lulla"))
  await t.wait(1800)
  body = await t.eval("document.body.innerText")
  t.check("today greeting", body.includes("Hi, Ivy"))
  t.check("quick log present", body.includes("QUICK LOG"))
  t.check("bottom nav", body.includes("Diaper") && body.includes("Growth") && body.includes("Mom"))

  await t.shot("e2e/smoke.png")
}