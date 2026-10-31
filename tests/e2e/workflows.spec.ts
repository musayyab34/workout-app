import { expect, test, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import type { Backup } from "../../src/lib/backup";

const runtimeErrors = new WeakMap<Page, string[]>();
test.beforeEach(({ page }) => {
  const errors: string[] = [];
  runtimeErrors.set(page, errors);
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error" && !message.text().includes("favicon.ico"))
      errors.push(message.text());
  });
});
test.afterEach(({ page }) => {
  expect(
    runtimeErrors.get(page) ?? [],
    "Browser runtime and hydration errors",
  ).toEqual([]);
});

async function stored(page: Page) {
  return page.evaluate(async () => {
    const request = indexedDB.open("fitness-tracker-v2:local");
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const read = (store: string) =>
      new Promise<unknown[]>((resolve, reject) => {
        const request = db
          .transaction(store, "readonly")
          .objectStore(store)
          .getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    try {
      return { sessions: await read("sessions"), drafts: await read("drafts") };
    } finally {
      db.close();
    }
  });
}

async function start(page: Page) {
  await page.goto("/programs/beginner-conditioning");
  await page.getByRole("button", { name: /^Start Workout$/i }).click();
  await expect(
    page.getByLabel("Actual repetitions", { exact: true }),
  ).toBeVisible();
}

async function record(page: Page, reps: number) {
  await page
    .getByLabel("Actual repetitions", { exact: true })
    .fill(String(reps));
  await page.getByRole("button", { name: /^Complete set$/i }).click();
}

async function nextSet(page: Page) {
  await page.getByRole("button", { name: /^Skip rest$/i }).click();
  await page.getByRole("button", { name: /^Start next set$/i }).click();
  await expect(
    page.getByLabel("Actual repetitions", { exact: true }),
  ).toHaveValue("");
}

async function endAndSave(page: Page) {
  await page
    .getByRole("button", { name: "Workout options", exact: true })
    .click();
  await page.getByRole("button", { name: /^End workout$/i }).click();
  await page.getByRole("button", { name: /^End and review$/i }).click();
  await page
    .getByRole("button", { name: /^Save to History$/i })
    .first()
    .click();
  await expect.poll(async () => (await stored(page)).sessions.length).toBe(1);
}

async function exportedBackup(page: Page): Promise<Buffer> {
  await page.goto("/settings");
  const downloading = page.waitForEvent("download");
  await page.getByRole("button", { name: /^Export backup$/i }).click();
  const file = await downloading;
  return readFile((await file.path())!);
}

async function selectBackup(page: Page, backup: Buffer | Backup) {
  await page.getByLabel("Backup JSON file", { exact: true }).setInputFiles({
    name: "backup.json",
    mimeType: "application/json",
    buffer: Buffer.isBuffer(backup)
      ? backup
      : Buffer.from(JSON.stringify(backup)),
  });
  await expect(
    page.getByRole("heading", { name: "Review import", exact: true }),
  ).toBeVisible();
}

test("records all 18 sets in mentor order with separate actuals and targets", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByText("Beginner Running Conditioning", { exact: true }).first(),
  ).toBeVisible();
  await expect(
    page.getByText("Pull-Up Progression", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Future Training Program", { exact: true }),
  ).toBeVisible();
  await start(page);
  const values = [
    13, 20, 20, 20, 20, 20, 20, 20, 20, 20, 20, 20, 5, 4, 3, 30, 25, 20,
  ];
  const names = [
    "Pogo Jumps",
    "Calf Raises",
    "Bodyweight Squats",
    "Sit-Ups",
    "Push-Ups",
    "Tibialis Anterior Raises",
  ];
  for (let index = 0; index < values.length; index++) {
    await expect(
      page.getByRole("heading", {
        name: names[Math.floor(index / 3)],
        exact: true,
      }),
    ).toBeVisible();
    await record(page, values[index]);
    if (index < values.length - 1) await nextSet(page);
  }
  await expect(
    page.getByRole("button", { name: /^Save to History$/i }).first(),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: /^Skip rest$/i })).toHaveCount(
    0,
  );
  await page
    .getByRole("button", { name: /^Save to History$/i })
    .first()
    .click();
  await expect.poll(async () => (await stored(page)).sessions.length).toBe(1);
  const saved = (await stored(page)).sessions[0] as {
    outcome: string;
    sets: { actualReps: number; target: { type: string; reps?: number } }[];
  };
  expect(saved.outcome).toBe("completed");
  expect(saved.sets.map((set) => set.actualReps)).toEqual(values);
  expect(saved.sets[0].target).toEqual({ type: "fixed", reps: 20 });
  expect(saved.sets[12].target.type).toBe("submaximal");
  expect(saved.sets[15].target.type).toBe("burning");
  expect((await stored(page)).drafts).toHaveLength(0);
  await page.goto("/history");
  await expect(
    page.getByText("All recorded", { exact: true }).first(),
  ).toBeVisible();
});

test("resumes an interrupted workout with confirmed results intact", async ({
  page,
}) => {
  await start(page);
  await record(page, 13);
  await expect(
    page.getByRole("button", { name: /^Skip rest$/i }),
  ).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: /^Resume workout$/i }).click();
  await expect(
    page.getByRole("button", { name: /^Skip rest$/i }),
  ).toBeVisible();
  const draft = (await stored(page)).drafts[0] as {
    sets: { actualReps: number | null }[];
  };
  expect(draft.sets[0].actualReps).toBe(13);
  await nextSet(page);
  await page.getByLabel("Actual repetitions", { exact: true }).fill("7");
  await expect
    .poll(
      async () => ((await stored(page)).drafts[0] as { input: string }).input,
    )
    .toBe("7");
  await page.reload();
  await page.getByRole("button", { name: /^Resume workout$/i }).click();
  await expect(
    page.getByLabel("Actual repetitions", { exact: true }),
  ).toHaveValue("7");
});

test("saves partial sessions and preserves skipped sets as missing", async ({
  page,
}) => {
  await start(page);
  await record(page, 13);
  await nextSet(page);
  await page
    .getByRole("button", { name: "Workout options", exact: true })
    .click();
  await page.getByRole("button", { name: /^Skip set$/i }).click();
  await expect(
    page.getByLabel("Actual repetitions", { exact: true }),
  ).toBeVisible();
  await endAndSave(page);
  const saved = (await stored(page)).sessions[0] as {
    outcome: string;
    sets: { status: string; actualReps: number | null }[];
  };
  expect(saved.outcome).toBe("partial");
  expect(saved.sets[0].actualReps).toBe(13);
  expect(saved.sets[1]).toMatchObject({ status: "skipped", actualReps: null });
  expect(saved.sets[2]).toMatchObject({
    status: "not-attempted",
    actualReps: null,
  });
  await page
    .getByRole("button", { name: "Edit Pogo Jumps set 2", exact: true })
    .click();
  await page
    .getByRole("combobox", { name: "Set status", exact: true })
    .selectOption("recorded");
  await page.getByLabel("Actual repetitions", { exact: true }).fill("9");
  await page
    .getByRole("button", { name: "Save correction", exact: true })
    .click();
  await expect(
    page.getByRole("dialog", { name: "Correct set result" }),
  ).not.toBeVisible();
  const corrected = (await stored(page)).sessions[0] as {
    sets: {
      status: string;
      actualReps: number | null;
      recordedAt: string | null;
      origin: string;
    }[];
  };
  expect(corrected.sets[1]).toMatchObject({
    status: "recorded",
    actualReps: 9,
    recordedAt: null,
    origin: "manual-correction",
  });
  await page
    .getByRole("button", { name: "Correct duration", exact: true })
    .click();
  await page
    .getByLabel("Elapsed duration in whole seconds", { exact: true })
    .fill("600");
  await page
    .getByRole("button", { name: "Save duration", exact: true })
    .click();
  await expect(
    page.getByRole("dialog", { name: "Correct workout duration" }),
  ).not.toBeVisible();
  expect(
    ((await stored(page)).sessions[0] as { correctedDurationMs: number })
      .correctedDurationMs,
  ).toBe(600000);
  await page.goto("/history");
  await expect(
    page.getByText("Partial", { exact: true }).first(),
  ).toBeVisible();
});

test("exports a backup and imports it into a fresh browser context without duplicates", async ({
  page,
  browser,
  baseURL,
}) => {
  await start(page);
  await record(page, 13);
  await endAndSave(page);
  await page.goto("/settings");
  const downloaded = page.waitForEvent("download");
  await page.getByRole("button", { name: /^Export backup$/i }).click();
  const download = await downloaded;
  expect(download.suggestedFilename()).toMatch(
    /^fitness-tracker-backup-.*\.json$/,
  );
  const path = await download.path();
  expect(path).toBeTruthy();
  const bytes = await readFile(path!);
  const exported = JSON.parse(bytes.toString()) as {
    application: string;
    sessions: unknown[];
  };
  expect(exported.application).toBe("personal-fitness-tracker");
  expect(exported.sessions).toHaveLength(1);
  const fresh = await browser.newContext({ baseURL });
  try {
    const restored = await fresh.newPage();
    await restored.goto("/settings");
    await restored
      .getByLabel("Backup JSON file", { exact: true })
      .setInputFiles({
        name: "backup.json",
        mimeType: "application/json",
        buffer: bytes,
      });
    await restored.getByRole("button", { name: /^Apply merge$/i }).click();
    await restored.getByRole("button", { name: /^Confirm merge$/i }).click();
    await expect
      .poll(async () => (await stored(restored)).sessions.length)
      .toBe(1);
    await restored
      .getByLabel("Backup JSON file", { exact: true })
      .setInputFiles({
        name: "backup-again.json",
        mimeType: "application/json",
        buffer: bytes,
      });
    await restored.getByRole("button", { name: /^Apply merge$/i }).click();
    await restored.getByRole("button", { name: /^Confirm merge$/i }).click();
    await expect
      .poll(async () => (await stored(restored)).sessions.length)
      .toBe(1);
    const restoredSession = (await stored(restored)).sessions[0] as {
      sets: { actualReps: number | null }[];
    };
    expect(restoredSession.sets[0].actualReps).toBe(13);
  } finally {
    await fresh.close();
  }
});

test("invalid imports do not modify existing records", async ({ page }) => {
  await start(page);
  await record(page, 8);
  await endAndSave(page);
  await page.goto("/settings");
  await page.getByLabel("Backup JSON file", { exact: true }).setInputFiles({
    name: "bad.json",
    mimeType: "application/json",
    buffer: Buffer.from("{broken"),
  });
  await expect(page.getByText(/not valid JSON/i)).toBeVisible();
  expect((await stored(page)).sessions).toHaveLength(1);
  await expect(
    page.getByRole("button", { name: /^Apply merge$/i }),
  ).toHaveCount(0);
});

test("resolves merge conflicts, replaces data, and restores the pre-import copy", async ({
  page,
}) => {
  await start(page);
  await record(page, 13);
  await endAndSave(page);
  const backup = JSON.parse((await exportedBackup(page)).toString()) as Backup;
  const session = backup.sessions[0];
  await page.goto(`/history/${session.id}`);
  await page
    .getByRole("button", { name: "Edit Pogo Jumps set 1", exact: true })
    .click();
  await page.getByLabel("Actual repetitions", { exact: true }).fill("8");
  await page
    .getByRole("button", { name: "Save correction", exact: true })
    .click();
  await expect(
    page.getByRole("dialog", { name: "Correct set result" }),
  ).not.toBeVisible();
  await page.goto("/settings");
  await selectBackup(page, backup);
  await page
    .getByLabel(`Resolve session ${session.id}`, { exact: true })
    .selectOption("imported");
  await page.getByRole("button", { name: "Apply merge", exact: true }).click();
  await page
    .getByRole("button", { name: "Confirm merge", exact: true })
    .click();
  await expect
    .poll(
      async () =>
        ((await stored(page)).sessions[0] as typeof session).sets[0].actualReps,
    )
    .toBe(13);
  await page
    .getByRole("button", { name: "Restore pre-import data", exact: true })
    .click();
  await page.getByRole("button", { name: "Restore data", exact: true }).click();
  await expect
    .poll(
      async () =>
        ((await stored(page)).sessions[0] as typeof session).sets[0].actualReps,
    )
    .toBe(8);
  const empty: Backup = {
    ...backup,
    sessions: [],
    draft: null,
    counts: { ...backup.counts, sessions: 0, drafts: 0 },
  };
  await selectBackup(page, empty);
  await page.getByLabel("Import mode", { exact: true }).selectOption("replace");
  await page
    .getByRole("button", { name: "Replace local data", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Confirm replacement", exact: true })
    .click();
  await expect.poll(async () => (await stored(page)).sessions.length).toBe(0);
  await page
    .getByRole("button", { name: "Restore pre-import data", exact: true })
    .click();
  await page.getByRole("button", { name: "Restore data", exact: true }).click();
  await expect.poll(async () => (await stored(page)).sessions.length).toBe(1);
  expect(
    ((await stored(page)).sessions[0] as typeof session).sets[0].actualReps,
  ).toBe(8);
});

test("restores an active backup as paused without running its timer", async ({
  page,
  browser,
  baseURL,
}) => {
  await start(page);
  await record(page, 13);
  await expect(
    page.getByRole("button", { name: "Skip rest", exact: true }),
  ).toBeVisible();
  const bytes = await exportedBackup(page);
  const backup = JSON.parse(bytes.toString()) as Backup;
  expect(backup.draft?.phase).toBe("resting");
  const fresh = await browser.newContext({ baseURL });
  try {
    const restored = await fresh.newPage();
    await restored.goto("/settings");
    await selectBackup(restored, bytes);
    await restored
      .getByRole("button", { name: "Apply merge", exact: true })
      .click();
    await restored
      .getByRole("button", { name: "Confirm merge", exact: true })
      .click();
    await expect
      .poll(
        async () =>
          ((await stored(restored)).drafts[0] as NonNullable<Backup["draft"]>)
            ?.phase,
      )
      .toBe("paused");
    const draft = (await stored(restored)).drafts[0] as NonNullable<
      Backup["draft"]
    >;
    expect(draft.pause?.startedAt).toBe(backup.exportedAt);
    expect(draft.rest?.status).toBe("paused");
    expect(draft.sets[0].actualReps).toBe(13);
    await restored.goto("/workout");
    await restored.getByRole("button", { name: /^Resume workout$/i }).click();
    await expect(
      restored.getByRole("button", { name: "Skip rest", exact: true }),
    ).toBeVisible();
  } finally {
    await fresh.close();
  }
});

test("rejects a stale workout action from another tab", async ({
  page,
  context,
}) => {
  await start(page);
  await record(page, 13);
  await expect(
    page.getByRole("button", { name: "Skip rest", exact: true }),
  ).toBeVisible();
  const second = await context.newPage();
  await second.goto("/workout");
  await second.getByRole("button", { name: /^Resume workout$/i }).click();
  await nextSet(second);
  // Dispatch on the background tab without focus refresh to exercise a genuinely stale revision.
  await page
    .getByRole("button", { name: "Skip rest", exact: true })
    .evaluate((button) => (button as HTMLButtonElement).click());
  await expect(
    page.getByText(/Another tab changed your data/).first(),
  ).toBeVisible();
  const current = (await stored(page)).drafts[0] as NonNullable<
    Backup["draft"]
  >;
  expect(current.phase).toBe("performing");
  expect(current.sets[0].actualReps).toBe(13);
  expect(current.sets[1].status).toBe("pending");
  await second.close();
});

test("keeps history and exercise charts usable with 5000 sessions", async ({
  page,
}) => {
  test.setTimeout(120000);
  await start(page);
  await record(page, 13);
  await endAndSave(page);
  const backup = JSON.parse((await exportedBackup(page)).toString()) as Backup;
  const base = backup.sessions[0];
  const key = (timestamp: string) =>
    new Intl.DateTimeFormat("en-CA", {
      timeZone: base.timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date(timestamp));
  backup.sessions = Array.from({ length: 5000 }, (_, index) => {
    const session = structuredClone(base);
    const offset = index * 2 * 86400000;
    const shifted = (time: string) =>
      new Date(Date.parse(time) - offset).toISOString();
    session.id = `fixture-session-${index}`;
    session.startedAt = shifted(base.startedAt);
    session.endedAt = shifted(base.endedAt);
    session.createdAt = shifted(base.createdAt);
    session.updatedAt = shifted(base.updatedAt);
    session.startLocalDate = key(session.startedAt);
    session.endLocalDate = key(session.endedAt);
    session.sets = session.sets.map((set, i) => ({
      ...set,
      id: `fixture-set-${index}-${i}`,
      recordedAt: set.recordedAt ? shifted(set.recordedAt) : null,
      activityDate: set.activityDate ? key(session.startedAt) : null,
    }));
    return session;
  });
  backup.counts.sessions = 5000;
  const bytes = Buffer.from(JSON.stringify(backup));
  await page.getByLabel("Backup JSON file", { exact: true }).setInputFiles({
    name: "large-backup.json",
    mimeType: "application/json",
    buffer: bytes,
  });
  if (bytes.length > 25 * 1024 * 1024)
    await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Review import", exact: true }),
  ).toBeVisible({ timeout: 60000 });
  await page.getByLabel("Import mode", { exact: true }).selectOption("replace");
  await page
    .getByRole("button", { name: "Replace local data", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Confirm replacement", exact: true })
    .click();
  await expect(
    page.getByText(/Import complete\. 5000 saved sessions/),
  ).toBeVisible({ timeout: 60000 });
  await page.goto("/history");
  await expect(
    page.getByText("5000 saved sessions", { exact: true }),
  ).toBeVisible({ timeout: 20000 });
  expect(await page.locator(".session-row").count()).toBe(20);
  await page.goto("/progress");
  await expect(page.getByText("65,000", { exact: true })).toBeVisible({
    timeout: 20000,
  });
  await page
    .getByRole("combobox", { name: "Exercise", exact: true })
    .selectOption("pogo-jumps");
  await page
    .getByRole("combobox", { name: "Chart date range", exact: true })
    .selectOption("all");
  await expect(page.locator(".chart circle")).toHaveCount(5000, {
    timeout: 20000,
  });
  await expect(page.getByRole("button")).not.toHaveCount(0);
});

for (const width of [320, 390, 768, 1440]) {
  test(`mobile/desktop layout has no horizontal overflow at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 844 });
    for (const route of [
      "/",
      "/programs/beginner-conditioning",
      "/history",
      "/progress",
      "/settings",
    ]) {
      await page.goto(route);
      await expect(page.getByRole("main")).toBeVisible();
      if (route === "/" && (width === 390 || width === 1440)) {
        await expect(page.getByText("Opening your training log…")).toHaveCount(
          0,
        );
        await page.screenshot({
          path: test.info().outputPath("home.png"),
          fullPage: true,
        });
      }
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
        route,
      ).toBe(true);
    }
    await start(page);
    await expect(
      page.getByLabel("Actual repetitions", { exact: true }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    if (width === 390)
      await page.screenshot({
        path: test.info().outputPath("workout.png"),
        fullPage: true,
      });
  });
}
