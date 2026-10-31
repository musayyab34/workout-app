import { test, expect } from "@playwright/test";
test("creates and edits a real variable-length routine without rewriting its saved snapshot", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/programs/new");
  await page
    .getByLabel("Program name", { exact: true })
    .fill("My custom training");
  await page
    .getByLabel("Routine name", { exact: true })
    .fill("Two-set routine");
  await page
    .getByLabel("Default rest seconds (blank inherits account preference)")
    .fill("0");
  await page
    .getByRole("button", { name: "Create new movement", exact: true })
    .click();
  await page.getByLabel("Exercise name", { exact: true }).fill("My movement");
  await page
    .getByLabel("Instructions / notes", { exact: true })
    .fill("Controlled repetitions.");
  await page.getByRole("button", { name: "Add set", exact: true }).click();
  await page
    .getByRole("combobox", { name: "Target type", exact: true })
    .nth(1)
    .selectOption("submaximal");
  await page
    .getByRole("button", { name: "Review changes", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Confirm and save program", exact: true })
    .click();
  await expect(page).not.toHaveURL(/\/programs\/new$/);
  await expect(page).toHaveURL(/\/programs\/[^/]+$/);
  const url = page.url();
  await expect(
    page.getByText("1 exercises · 2 sets", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Start Workout", exact: true })
    .click();
  await page.getByLabel("Actual repetitions", { exact: true }).fill("7");
  await page.getByRole("button", { name: "Complete set", exact: true }).click();
  await page
    .getByRole("button", { name: "Start next set", exact: true })
    .click();
  await page.getByLabel("Actual repetitions", { exact: true }).fill("0");
  await page.getByRole("button", { name: "Complete set", exact: true }).click();
  await page
    .getByRole("button", { name: "Save to History", exact: true })
    .first()
    .click();
  await expect(page).toHaveURL(/\/history\//);
  const before = await page.evaluate(async () => {
    const req = indexedDB.open("fitness-tracker-v2:local");
    const db = await new Promise<IDBDatabase>(
      (resolve) => (req.onsuccess = () => resolve(req.result)),
    );
    return new Promise<unknown>((resolve) => {
      const r = db.transaction("sessions").objectStore("sessions").getAll();
      r.onsuccess = () => {
        db.close();
        resolve(r.result);
      };
    });
  });
  await page.goto(url + "/edit");
  await page
    .getByLabel("Exercise name", { exact: true })
    .fill("Renamed movement");
  await page.getByRole("button", { name: "Add set", exact: true }).click();
  await page
    .getByRole("button", { name: "Review changes", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Confirm and save program", exact: true })
    .click();
  await expect(
    page.getByText("1 exercises · 3 sets", { exact: true }),
  ).toBeVisible();
  const after = await page.evaluate(async () => {
    const req = indexedDB.open("fitness-tracker-v2:local");
    const db = await new Promise<IDBDatabase>(
      (resolve) => (req.onsuccess = () => resolve(req.result)),
    );
    return new Promise<unknown>((resolve) => {
      const r = db.transaction("sessions").objectStore("sessions").getAll();
      r.onsuccess = () => {
        db.close();
        resolve(r.result);
      };
    });
  });
  expect(after).toEqual(before);
  expect(errors).toEqual([]);
});
test("shows local fallback when cloud configuration is absent", async ({
  page,
}) => {
  await page.goto("/auth/sign-in");
  await expect(page.getByText(/Cloud sync is not configured/)).toBeVisible();
  await page
    .getByRole("link", { name: "Continue locally", exact: true })
    .first()
    .click();
  await expect(
    page.getByRole("heading", { name: "Build your foundation." }),
  ).toBeVisible();
});
