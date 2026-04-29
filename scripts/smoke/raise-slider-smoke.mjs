import {
  artifactPath,
  createRoom,
  createSmokeContext,
  joinRoom,
  launchSmokeBrowser,
  sleep,
  startHand,
  writeSmokeArtifact,
} from './poker-smoke-harness.mjs';

async function getRaiseSnapshot(page, role) {
  return page.evaluate((roleName) => {
    const panel = document.querySelector('.poker-raise-panel');
    const slider = document.querySelector('.poker-raise-range[role="slider"]');
    const input = document.querySelector('.poker-raise-panel input[type="number"]');
    const rectFor = (element) => {
      if (!element) return null;
      const rect = element.getBoundingClientRect();
      return {
        left: rect.left,
        top: rect.top,
        right: rect.right,
        bottom: rect.bottom,
        width: rect.width,
        height: rect.height,
      };
    };
    const rect = rectFor(slider);
    const visible = Boolean(
      rect &&
      rect.width > 0 &&
      rect.height > 0 &&
      rect.bottom > 0 &&
      rect.right > 0 &&
      getComputedStyle(slider).visibility !== 'hidden'
    );

    return {
      role: roleName,
      visible,
      panelClass: panel?.className || '',
      sliderScaleText: document.querySelector('.poker-slider-scale')?.textContent.trim() || '',
      hasLegacyPotScaleLabel: [...document.querySelectorAll('.poker-slider-label')]
        .some((element) => element.textContent.trim() === '底池'),
      fullPotScaleLabel: document.querySelector('.poker-slider-label-pot')?.textContent.trim() || null,
      fullPotScalePosition: slider
        ? getComputedStyle(document.querySelector('.poker-slider-label-pot') || slider).getPropertyValue('--full-pot-slider-position').trim() || null
        : null,
      inputValue: input?.value ?? null,
      inputMin: input?.min ?? null,
      inputMax: input?.max ?? null,
      inputStep: input?.step ?? null,
      sliderNow: slider?.getAttribute('aria-valuenow'),
      sliderMin: slider?.getAttribute('aria-valuemin'),
      sliderMax: slider?.getAttribute('aria-valuemax'),
      fill: slider ? getComputedStyle(slider).getPropertyValue('--raise-slider-fill').trim() : null,
      rect,
    };
  }, role);
}

async function waitForRaisePage(entries, timeoutMs = 45_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    for (const entry of entries) {
      const snapshot = await getRaiseSnapshot(entry.page, entry.role);
      if (snapshot.visible && snapshot.inputValue !== null) return { ...entry, snapshot };
    }
    await sleep(250);
  }
  return null;
}

const browser = await launchSmokeBrowser();
const contexts = [];
let result = { ok: false };

try {
  const hostContext = await createSmokeContext(browser, { width: 1366, height: 900 });
  const guestContext = await createSmokeContext(browser, { width: 1366, height: 900 });
  contexts.push(hostContext, guestContext);

  const hostPage = await hostContext.newPage();
  const guestPage = await guestContext.newPage();
  const roomId = await createRoom(hostPage, `SliderHost${Date.now() % 10000}`);
  await joinRoom(guestPage, roomId, `SliderGuest${Date.now() % 10000}`);
  await startHand(hostPage);
  await sleep(1900);

  const active = await waitForRaisePage([
    { page: hostPage, role: 'host' },
    { page: guestPage, role: 'guest' },
  ]);

  if (!active) {
    result = { ok: false, roomId, error: 'raise slider did not become visible' };
  } else {
    const before = active.snapshot;
    const clickX = before.rect.left + before.rect.width * 0.74;
    const clickY = before.rect.top + before.rect.height / 2;
    await active.page.mouse.click(clickX, clickY);
    await sleep(300);

    const after = await getRaiseSnapshot(active.page, active.role);
    const screenshot = artifactPath('poker-raise-slider-smoke.png');
    await active.page.screenshot({ path: screenshot, fullPage: true });

    const inputNumber = Number(after.inputValue);
    const sliderNumber = Number(after.sliderNow);
    const fullPotPosition = Number.parseFloat(after.fullPotScalePosition);
    result = {
      ok: Boolean(
        roomId &&
        before.visible &&
        after.visible &&
        before.inputStep === '10' &&
        Number.isFinite(inputNumber) &&
        inputNumber > 0 &&
        inputNumber % 10 === 0 &&
        Number.isFinite(sliderNumber) &&
        sliderNumber === inputNumber &&
        after.fill &&
        after.fill !== '0%' &&
        !after.hasLegacyPotScaleLabel &&
        after.fullPotScaleLabel === '满池' &&
        Number.isFinite(fullPotPosition) &&
        fullPotPosition > 8 &&
        fullPotPosition < 35
      ),
      roomId,
      activeRole: active.role,
      before,
      after,
      screenshot,
    };
  }
} finally {
  await Promise.all(contexts.map((context) => context.close().catch(() => {})));
  await browser.close();
}

const output = writeSmokeArtifact('poker-raise-slider-smoke.json', result);
console.log(JSON.stringify({
  ok: result.ok,
  output,
  roomId: result.roomId,
  activeRole: result.activeRole,
}, null, 2));

if (!result.ok) process.exitCode = 1;
