// Take README screenshots of a running SalCurve demo with Playwright (Chromium).
//   npx -y playwright@1.49.1 install --with-deps chromium
//   node docs/screenshots.mjs http://127.0.0.1:8080 <visitor-key>
import { chromium } from "playwright";

const base = process.argv[2] ?? "http://127.0.0.1:8080";
const key = process.argv[3] ?? "";
const out = new URL(".", import.meta.url).pathname;

const browser = await chromium.launch();
async function shot(path, file, viewport, waitMs = 6000, act = null) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 2, colorScheme: "dark" });
  if (key) await ctx.addInitScript((k) => localStorage.setItem("salcurve.key", k), key);
  const page = await ctx.newPage();
  await page.goto(base + path, { waitUntil: "networkidle" });
  await page.waitForTimeout(waitMs);
  if (act) await act(page);
  await page.screenshot({ path: `${out}${file}`, fullPage: false });
  await ctx.close();
  console.log("saved", file);
}

const desktop = { width: 1440, height: 900 };
await shot("/", "home.png", desktop);
await shot("/t/WAVE", "token.png", desktop);
await shot("/swap?token=WAVE", "swap.png", desktop, 6000, async (page) => {
  await page.fill("input[inputmode=decimal]", "250");
  await page.waitForTimeout(2500);
});
await shot("/swap?token=WAVE", "swap-picker.png", desktop, 5000, async (page) => {
  await page.getByRole("button", { name: /WAVE/ }).first().click();
  await page.fill("input[placeholder^=Name]", "sal");
  await page.waitForTimeout(2000);
});
await shot("/launch", "launch.png", desktop);
await shot("/leaderboard", "leaderboard.png", desktop);
await shot("/portfolio", "portfolio.png", desktop);
await shot("/t/WAVE", "mobile-token.png", { width: 390, height: 844 });
await shot("/swap?token=WAVE&side=sell", "mobile-swap.png", { width: 390, height: 844 });
await browser.close();
