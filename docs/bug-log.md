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
| 8 | One 515 KB JavaScript bundle; app loads every profile, post, vote and comment at once | `npm run build` output (Report 4) | Medium | Fixed (Step 6: pages and libraries load separately, largest file 259 KB; posts load 20 at a time with only their votes and comments) |
| 9 | oxlint: 3 warnings (only-export-components ×2, set-state-in-effect) | `npx oxlint` (Report 4) | Low | Open – Step 7 |
| 10 | Double-click on Accept/Decline sent two updates; second showed "This request was already answered" | Code review + double-click test (Step 1) | Medium | Fixed (Step 1) |
| 11 | Double-click on Send request sent two requests; raw duplicate-key error | Code review + double-click test (Step 1) | Medium | Fixed (Step 1) |
| 12 | Raw database errors shown in help requests, comments, replies, delete, edit profile, onboarding and sign-in | Code review (Step 1) | Medium | Fixed (Step 1) |
| 13 | Help requests and their status do not update until the page is reloaded | Two-account test (Step 1) | Medium | Fixed (Step 2, Supabase Realtime) |
| 14 | Double-click on Reply posted the same reply twice (no database rule stops duplicate replies) | Double-click test (Step 1) | Medium | Fixed (Step 1) |
| 15 | Double-click on Comment sent two ratings; raw duplicate-key error | Double-click test (Step 1) | Low | Fixed (Step 1) |
| 16 | Database accepts a help request to a student who does not teach that subject (app never offers it, but the API allows it) | Two-student database test (Step 1) | Low | Fixed (Step 5: database rejects it, check_help_request_safety) |
| 17 | Load-error banner showed raw text ("JWT issued at future") and a developer-only setup hint to students | Two-account test after Supabase project was restored (Step 1) | Low | Fixed |
| 18 | On iPhone, opening the keyboard in a long chat makes the top bar and message box jump; the box hides behind the keyboard for 1–2 s; the chat also jumps when a new message arrives | Real-phone screen recordings (Step 2) | Medium | Fixed |
| 19 | No tab is highlighted on the chat page (it belongs to Help) | Real-phone screenshot (Step 2) | Low | Fixed |
| 20 | Keyboard closes after every Send, so each message needs an extra tap on the text box; sent messages only appear after the server replies | Real-phone test by student tester (Step 2) | Medium | Fixed |
| 21 | Text typed while the previous message was still sending was wiped when that send finished | Code review while fixing #20 (Step 2) | Medium | Fixed |
| 22 | A student could create a help request that was already "accepted" and open a chat with anyone without the helper agreeing (the database did not check the status of new requests) | Code review of the request rules (Step 3) | High | Fixed (Step 3: new requests are forced to pending) |
| 23 | After a request was resolved, the student could not ask the same helper about the same subject again (the card kept showing the old request) | Student tester, two-account test (Step 3) | Medium | Fixed |
| 24 | Help page became a long mixed list: every request ever sent or received was shown above and below the helper search | Student tester, two-account test (Step 3) | Medium | Fixed |
