# 🧪 Playwright UI Testing – DataWell MVP

This project includes automated **UI testing** using [Playwright](https://playwright.dev/) to validate the full user flow for submitting health and lifestyle data.

## What’s Included

- [x] Playwright test environment setup (`@playwright/test`)
- [x] Custom test config (`playwright.config.ts`)
- [x] Form submission test (`tests/form.spec.ts`)
- [x] Output auto-saved in `/test-results/`
- [x] Clean `.gitignore` to exclude results from Git tracking

##  How to Set Up Testing

1. **Install dependencies**
```bash
npm install
```

2. **Install Playwright and browsers**
```bash
npm install -D playwright
npx playwright install
```

##  Run the UI Test

> Make sure your dev server is running locally at `http://localhost:3000`

```bash
npm run dev
```

Then in a separate terminal:
```bash
npx playwright test
```

## 🧾 What Gets Tested

- The user form renders correctly
- All fields accept user input
- Dropdowns work as expected
- Submitting valid data triggers success
- Alerts and UI feedback are validated

##  Folder Structure

```
/tests
  └── form.spec.ts           # Main UI test
/test-results                # Auto-generated test output (git-ignored)
playwright.config.ts         # Playwright config
```

##  Ignored Files

The following is excluded from Git tracking in `.gitignore`:

```
/test-results
```

##  Sample Test Command Output

```bash
Running 1 test using 1 worker

    tests/form.spec.ts:5:1 › DataWell form submits user data successfully (4s)
```