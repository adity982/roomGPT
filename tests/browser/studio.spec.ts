import { test, expect } from "@playwright/test";

test("designer to client approval, private images, immutable budgets and revocation", async ({
  page,
  browser,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(page).toHaveURL(/\/studio$/);
  await page.getByLabel("Studio name").fill("Atelier Field");
  await page
    .getByLabel("Email", { exact: true })
    .fill(`designer-${Date.now()}@example.test`);
  await page
    .getByLabel("Password", { exact: true })
    .fill("Design-test-password-42");
  await page.getByRole("button", { name: "Create studio" }).click();
  await page.getByRole("button", { name: "Open sample project" }).click();
  await expect(
    page.getByRole("heading", { name: "Living room refresh (sample)" }),
  ).toBeVisible();
  await expect(page.getByRole("status")).toContainText(
    "Sample project created",
  );
  const state = await (await page.request.get("/api/studio")).json();
  const project = state.projects[0];
  expect(project.shares).toEqual([]);
  expect(project.ownerId).toBeUndefined();
  const anonymous = await browser.newContext({
    baseURL: process.env.STUDIO_TEST_BASE_URL || "http://localhost:3101",
  });
  expect(
    (
      await anonymous.request.get(
        `/api/studio/media/${project.versions[0].assetId}`,
      )
    ).status(),
  ).toBe(404);
  expect(
    (
      await anonymous.request.get(`/api/studio/projects/${project.id}`)
    ).status(),
  ).toBe(401);

  await page.getByRole("button", { name: "Compare", exact: true }).click();
  await expect(page.getByLabel("Comparison position")).toBeVisible();
  await page.getByLabel("Comparison position").focus();
  await page.getByLabel("Comparison position").press("ArrowLeft");
  await page.screenshot({
    path: "test-results/studio-desktop.png",
    fullPage: true,
  });
  await page.getByRole("tab", { name: "Budget" }).click();
  await page.getByLabel("Unit price", { exact: true }).first().fill("55000");
  await page.getByLabel("Supplier name").first().fill("Field Furnishings");
  await page
    .getByLabel("Supplier link")
    .first()
    .fill("https://example.com/sofa");
  await page.getByLabel("Price status").first().selectOption("quoted");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Project saved");
  const exportFile = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export CSV" }).click();
  expect((await exportFile).suggestedFilename()).toBe("room-budget.csv");
  await page.getByRole("button", { name: "Share proposal" }).click();
  const urlInput = page.getByLabel("Review link", { exact: true });
  await expect(urlInput).toBeVisible();
  const reviewUrl = await urlInput.inputValue();
  const rawToken = reviewUrl.split("/").pop();
  const client = await anonymous.newPage();
  await client.goto(reviewUrl);
  await expect(
    client.getByRole("heading", { name: "Living room refresh (sample)" }),
  ).toBeVisible();
  await expect(client.getByText("Field Furnishings")).toBeVisible();
  const frozen = await (
    await anonymous.request.get(`/api/studio/review/${rawToken}`)
  ).json();
  expect(frozen.snapshot.lines[0].unitPrice).toBe(55000);
  expect(
    (
      await anonymous.request.get(
        `/api/studio/media/${project.versions[0].assetId}?review=${rawToken}`,
      )
    ).status(),
  ).toBe(404);
  expect(
    (
      await anonymous.request.get(
        `/api/studio/media/${frozen.snapshot.version.assetId}?review=${rawToken}`,
      )
    ).status(),
  ).toBe(200);
  await client.getByLabel("Your name", { exact: true }).fill("Meera Shah");
  await client.getByLabel("Decision", { exact: true }).selectOption("changes");
  await client
    .getByLabel("Your feedback", { exact: true })
    .fill("Please retain the existing curtains.");
  await client.getByRole("button", { name: "Send feedback" }).click();
  await expect(client.getByRole("status")).toContainText(
    "feedback has been saved",
  );
  await client.getByLabel("Decision", { exact: true }).selectOption("approve");
  await client.getByRole("checkbox").check();
  await client.getByRole("button", { name: "Record approval" }).click();
  await expect(client.getByText("Approved by Meera Shah")).toBeVisible();
  await client.reload();
  await expect(client.getByText("Approved by Meera Shah")).toBeVisible();
  expect(
    (
      await anonymous.request.post(`/api/studio/review/${rawToken}`, {
        data: { action: "approve", name: "Duplicate", message: "" },
      })
    ).status(),
  ).toBe(409);

  await page.getByRole("button", { name: "Refresh reviews" }).click();
  await expect(page.getByText("Approved", { exact: true })).toBeVisible();
  await page.getByRole("tab", { name: "Budget" }).click();
  await page.getByLabel("Unit price", { exact: true }).first().fill("65000");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Project saved");
  const after = await (
    await anonymous.request.get(`/api/studio/review/${rawToken}`)
  ).json();
  expect(after.snapshot.lines[0].unitPrice).toBe(55000);
  expect(
    after.entries.filter(
      (entry: { action: string }) => entry.action === "approve",
    ),
  ).toHaveLength(1);
  expect(
    (
      await page.request.patch(`/api/studio/projects/${project.id}`, {
        data: project,
      })
    ).status(),
  ).toBe(409);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("tab", { name: "Design", exact: true }).click();
  await page.screenshot({
    path: "test-results/studio-mobile.png",
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  for (const name of ["Budget", "Brief", "Reviews"]) {
    await page.getByRole("tab", { name }).click();
    await page.screenshot({
      path: `test-results/${name.toLowerCase()}-mobile.png`,
      fullPage: true,
    });
    const overflow = await page.evaluate(() =>
      Array.from(
        document.querySelectorAll(
          "main, fieldset, section, .budget-table-wrap, .budget-bottom, .budget-totals, .heading-actions",
        ),
      )
        .map((el) => ({
          tag: el.tagName,
          className: el.className,
          width: el.getBoundingClientRect().width,
          right: el.getBoundingClientRect().right,
        }))
        .filter((el) => el.right > innerWidth + 1),
    );
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      JSON.stringify({ name, overflow }),
    ).toBe(true);
  }
  await client.setViewportSize({ width: 390, height: 844 });
  await client.screenshot({
    path: "test-results/client-mobile.png",
    fullPage: true,
  });
  expect(
    await client.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "Revoke link" }).click();
  await expect(page.getByText("Revoked", { exact: true })).toBeVisible();
  await client.reload();
  await expect(
    client.getByRole("heading", { name: "This proposal is unavailable." }),
  ).toBeVisible();
  expect(
    (
      await anonymous.request.get(
        `/api/studio/media/${frozen.snapshot.version.assetId}?review=${rawToken}`,
      )
    ).status(),
  ).toBe(404);
  expect(errors).toEqual([]);
  await anonymous.close();
});

test("account isolation, validation, and upload workflow", async ({
  page,
  browser,
}) => {
  await page.goto("/studio");
  await page.getByLabel("Studio name").fill("Studio Two");
  await page
    .getByLabel("Email", { exact: true })
    .fill(`studio-two-${Date.now()}@example.test`);
  await page
    .getByLabel("Password", { exact: true })
    .fill("Design-test-password-42");
  await page.getByRole("button", { name: "Create studio" }).click();
  await page
    .getByRole("button", { name: "New project", exact: true })
    .first()
    .click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Project name").fill("Reading room");
  await dialog.getByLabel("Client name").fill("Asha Rao");
  await dialog.getByRole("button", { name: "Create project" }).click();
  await expect(
    page.getByRole("heading", { name: "Reading room" }),
  ).toBeVisible();
  await page.getByRole("tab", { name: "Design", exact: true }).click();
  await page
    .getByLabel("Upload room photo", { exact: true })
    .setInputFiles("public/original-pic.jpg");
  await expect(page.getByRole("status")).toContainText("Room photo saved");
  await page
    .getByLabel("Upload designer concept", { exact: true })
    .setInputFiles("public/generated-pic-2.jpg");
  await expect(page.getByRole("status")).toContainText("Concept saved");
  const data = await (await page.request.get("/api/studio")).json();
  const project = data.projects[0];
  expect(project.versions).toHaveLength(2);
  expect(
    (
      await page.request.post(`/api/studio/projects/${project.id}/generate`, {
        data: {
          baseId: project.selectedVersionId,
          style: "Modern",
          prompt: "Change sofa",
        },
      })
    ).status(),
  ).toBe(503);
  expect(
    (
      await page.request.patch(`/api/studio/projects/${project.id}`, {
        data: { ...project, budget: -1 },
      })
    ).status(),
  ).toBe(400);
  const invalid = {
    id: "item",
    name: "Sofa",
    category: "Furniture",
    quantity: 1,
    unitPrice: 10,
    supplier: "",
    url: "javascript:alert(1)",
    status: "quoted",
  };
  expect(
    (
      await page.request.patch(`/api/studio/projects/${project.id}`, {
        data: { ...project, lines: [invalid] },
      })
    ).status(),
  ).toBe(400);
  const other = await browser.newContext({
    baseURL: process.env.STUDIO_TEST_BASE_URL || "http://localhost:3101",
  });
  await other.request.post("/api/studio/auth", {
    data: {
      mode: "register",
      name: "Other Studio",
      email: `other-${Date.now()}@example.test`,
      password: "Design-test-password-42",
    },
  });
  expect(
    (await other.request.get(`/api/studio/projects/${project.id}`)).status(),
  ).toBe(404);
  expect(
    (
      await other.request.get(
        `/api/studio/media/${project.versions[0].assetId}`,
      )
    ).status(),
  ).toBe(404);
  expect(
    (await other.request.delete(`/api/studio/projects/${project.id}`)).status(),
  ).toBe(404);
  expect(
    (
      await other.request.patch(`/api/studio/projects/${project.id}`, {
        data: project,
      })
    ).status(),
  ).toBe(404);
  expect(
    (
      await page.request.post("/api/studio/projects", {
        headers: { Origin: "https://other.example" },
        data: { name: "Bad", client: "Bad", budget: 1 },
      })
    ).status(),
  ).toBe(403);
  await other.close();
});
