# SkillLoop bug log

Bugs 1–9 are from Report 4 (weeks 7–8). Bugs 10 onward are from weeks 9–10.
Severity: High = wrong data or security, Medium = error or broken flow a student hits, Low = cosmetic or rare.

| # | Bug | How found | Severity | Status |
|---|-----|-----------|----------|--------|
| 1 | Line breaks in explanations collapsed into one paragraph | Manual test (Report 4) | Low | Fixed (8d746ad) |
| 2 | Header wider than the screen at 320–375px; Write and Sign out cut off | Manual test on phone width (Report 4) | Medium | Fixed (79d29dd) |
| 3 | Title over 120 characters showed a raw database error | Manual test (Report 4) | Medium | Fixed (d59e07e) |
| 4 | Double-click on Helpful: raw duplicate-key error, count showed 0 but 1 vote saved | Manual test (Report 4) | Medium | Fixed (cc24d8d) |
| 5 | Explanation over 4000 characters showed a raw database error | Manual test (Report 4) | Medium | Fixed (36d1034) |
| 6 | iPhone zoomed in when tapping a form field (text under 16px) | Manual test on iPhone (Report 4) | Low | Fixed (29f48a3) |
| 7 | Tabs and buttons 36–39px tall, below the 44px tap target | Manual test on phone width (Report 4) | Low | Fixed (c327f4d) |
| 8 | One 515 KB JavaScript bundle; app loads every profile, post, vote and comment at once | `npm run build` output (Report 4) | Medium | Open – Step 6 |
| 9 | oxlint: 3 warnings (only-export-components ×2, set-state-in-effect) | `npx oxlint` (Report 4) | Low | Open – Step 7 |
| 10 | Double-click on Accept/Decline sent two updates; second showed "This request was already answered" | Code review + double-click test (Step 1) | Medium | Fixed (Step 1) |
| 11 | Double-click on Send request sent two requests; raw duplicate-key error | Code review + double-click test (Step 1) | Medium | Fixed (Step 1) |
| 12 | Raw database errors shown in help requests, comments, replies, delete, edit profile, onboarding and sign-in | Code review (Step 1) | Medium | Fixed (Step 1) |
| 13 | Help requests and their status do not update until the page is reloaded | Two-account test (Step 1) | Medium | Open – Step 2 (Realtime) |
| 14 | Double-click on Reply posted the same reply twice (no database rule stops duplicate replies) | Double-click test (Step 1) | Medium | Fixed (Step 1) |
| 15 | Double-click on Comment sent two ratings; raw duplicate-key error | Double-click test (Step 1) | Low | Fixed (Step 1) |
| 16 | Database accepts a help request to a student who does not teach that subject (app never offers it, but the API allows it) | Two-student database test (Step 1) | Low | Open – Step 5 (safety) |
