import { test, expect } from '@playwright/test';

test('DataWell form submits user data successfully', async ({ page }) => {
  await page.goto('http://localhost:3000'); // Change if hosted elsewhere

  // Fill out the form
  await page.getByPlaceholder('Age').fill('25');
  await page.selectOption('select[name="gender"]', 'Male');
  await page.getByPlaceholder('Height (cm)').fill('180');
  await page.getByPlaceholder('Weight (kg)').fill('80');
  await page.getByPlaceholder('City').fill('NYC');
  await page.getByPlaceholder('Country').fill('USA');
  await page.getByPlaceholder('Zip Code').fill('10001');
  await page.getByPlaceholder('Occupation').fill('QA Engineer');
  await page.getByPlaceholder('Education').fill('Bachelor');
  await page.selectOption('select[name="smoking"]', 'No');
  await page.getByPlaceholder('Drinks per Week').fill('2');

  // Submit
  await page.getByRole('button', { name: /submit to datawell/i }).click();

  // Assert alert
  page.on('dialog', async (dialog) => {
    expect(dialog.message()).toContain('Data submitted');
    await dialog.dismiss();
  });
});
