import { test, expect, request } from '@playwright/test';

test('API: POST /api/submit stores user data', async () => {
  const api = await request.newContext();

  const response = await api.post('http://localhost:3000/api/submit', {
    data: {
      age: 25,
      gender: 'Male',
      height: 180,
      weight: 80,
      city: 'San Francisco',
      country: 'US',
      zip: '94107',
      occupation: 'Engineer',
      education: 'Masters',
      smoking: 'No',
      drinksPerWeek: 2,
    },
  });

  expect(response.status()).toBe(200);
  const json = await response.json();
  expect(json.success).toBe(true);
});
