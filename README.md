# Income Estimator (demo)
Mobile-first sales compensation calculator built for LinkedIn DM sharing: three base-salary tracks, tiered marginal commission, benefits opt-in with family size, LinkedIn lead gate, results summary.
Static site (index.html, styles.css, app.js). All math is in `CONFIG` + `calculate()` at the top of app.js; the tier numbers are placeholders. Run `node app.js --test` for the math checks.
Mocked in the demo: LinkedIn sign-in returns a sample profile, and the NetHunt webhook payload is shown but not sent.
Production: "Sign in with LinkedIn" via OpenID Connect (same-tab redirect) handled by a small serverless function, which exchanges the code for name/email and POSTs the lead plus results to the NetHunt webhook before redirecting back to the results.
