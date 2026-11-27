# Within Means — Build Spec

> **For Claude Code:** This is the source of truth for building the Within Means website. The visual design lives in a Claude Design canvas (link below). Follow the **data model** (§4) and **rules** (§5) exactly. The screens (§6) describe behavior; match the design for layout and look. Build in the **phases** in §9, and make the **acceptance tests** in §10 pass before moving to the next phase. The platform is decided in §12 (AWS: Aurora DSQL, Cognito, Lambda, CloudFront); §8 lists the requirements it meets. The development plan (`within-means-dev-plan.md`, in the repo as `docs/PLAN.md`) breaks the phases into tickets.

**Design reference:** https://claude.ai/artifact/4XwwpcVFRAHrjU1kZ1jkd4 — each screen below names its artboard file (e.g. `Main.dc.html`). A pinned snapshot of the artboards lives in the repo under `design/`.

---

## 1. What this is

Within Means replaces a personal Google Sheet that tracks monthly bills, paychecks and investment income. It answers two questions every month:

1. **Am I living within my means?** — spending money in vs. money out.
2. **Where should this week's investment income go?** — a weekly checklist of money moves (savings, checking, reinvest) with buy suggestions, where anything not moved carries forward.

A household is one person or two partners. Partners share all data but each has their own login.

### Principles

- **Enter once, read everywhere.** Every bill, payment and transfer is one record. Every page reads the same records, so a month shows the same numbers everywhere.
- **Manual entry, made fast.** No bank or brokerage connections. Entry forms are short, remember recent values, and work well on a phone.
- **Track balances, not transactions.** Credit cards are tracked as a monthly statement balance only. Individual charges are never entered.
- **Suggestions never change data on their own.** Reinvest suggestions don't change holdings. Options assignment doesn't change shares. The user records buys and sells explicitly.
- **Past months don't change after the fact.** Each month keeps the splits it used. Closed months are locked until the user unlocks them.

### Out of scope (decided)

- Importing from Google Sheets or any CSV.
- Tracking individual credit card charges.
- Household settings after sign-up: inviting a partner later, changing access, removing members.
- An "Added by" label on entries.
- Updating holdings automatically from buy suggestions.
- Live price feeds. Prices are entered by hand in v1. Design the price field so a feed can be added later.
- Bank or brokerage syncing.
- Reminders and notifications of any kind: no push, no reminder emails, no digest, no reminder settings. The dashboard's **This week** list (§5.13) is the only "what's due" view.

---

## 2. Glossary

| Term | Meaning |
|---|---|
| **Household** | The shared container for all financial data. One or two members. |
| **Spending money / Money in** | Paychecks + one-time income + investment income actually moved to checking. Money sent to savings or reinvested is **not** counted. |
| **Money out** | Recurring bills (at estimate until the actual is entered) + one-time bills + planned credit card payments. |
| **Kept** | Money in − money out, for a month or a year. |
| **Spent %** | Money out ÷ money in × 100, rounded. |
| **Investment income** | Options premiums (net of buy-back costs) + weekly/daily dividends + monthly dividends. Always shown in full, separate from money in. |
| **Income type** | One of three: `options`, `weekly` (includes daily payers such as STRC), `monthly`. |
| **Bucket** | One of four destinations for investment income: `savings` (long-term savings), `checking`, `reinvest_weekly`, `reinvest_monthly`. |
| **Splits** | For each income type, the percentage that goes to each bucket. Each type's four percentages sum to 100. |
| **Money moves** | The weekly checklist of transfers, one per bucket per week. |
| **Carry-over** | Any bucket amount not moved. It carries to the next week, and from the last week of a month into the next month. |
| **Bills covered** | How many recurring bills the money actually moved to checking would pay, applied smallest bill first. |
| **Cushion** | The minimum checking balance the user wants to keep. Forecasts warn below it. |
| **Week of month** | Week 1 = days 1–7, week 2 = 8–14, week 3 = 15–21, week 4 = 22 to the end of the month. |

---

## 3. Users, households and sign-in

Design: `SignIn.dc.html`, `Setup.dc.html`

### Creating an account

1. **Who's managing the money?**
   - **Just me:** one member, and no partner can be added later.
   - **Me and a partner:** the user names the household and invites the partner during sign-up.
2. **Create your login:** first name, email, password. The password needs at least 8 characters; show a 4-step strength meter. Partner mode also asks for the household name.
3. **Invite your partner** (partner mode only):
   - Fields: partner's first name, email, access level and an optional note.
   - Access is either **Full access** (add, edit, delete) or **View only**.
   - Reject the partner's email if it matches the user's own.
   - There is **no "invite later" option**. "Send invite & finish" is the only way forward. "Back" stays available.
4. **Done:** shows "You're in, {name}", the invite status (pending, expires in 7 days, Resend), and "Start setting up", which opens the setup wizard.

### The partner accepting an invite

- The invite email links to an accept screen. It shows who invited them, the household name, the note and the access level.
- The partner creates their own login: name, email (prefilled with the invited address, but editable) and password.
- On joining they see the same household data. Their login and password are their own.

### Sign in

- Email and password, plus "Keep me signed in on this device".
- Also offer "Forgot password?" and sign-in with a passkey (can come after v1).

### Permissions

| Action | Full access | View only |
|---|---|---|
| See everything | ✓ | ✓ |
| Create, edit or delete any record | ✓ | ✗ |

The person who created the household is the owner and always has full access.

### A login with no household

A signed-in login that is in no household (for example one made outside sign-up) sees "This login isn't in a household" with its email and a **Sign out** button, on the Dashboard, on every member page and in setup. There are no write controls.

### First-time setup wizard (9 steps)

- **Saving:** each step saves when the user continues. The user can leave and resume, and jump to any step from the stepper.
- **Steps marked optional** can be skipped. Skipped steps show in the stepper and in Review.

| # | Step | Required | Creates | Checks |
|---|---|---|---|---|
| 1 | Welcome | ✓ | First tracked month: this month (catch up from the 1st) or next month (start fresh) | — |
| 2 | Bank accounts | ✓ | Accounts (name, type checking/savings/cash, balance today) and the checking cushion | At least one account; every account has a name and a balance |
| 3 | Paychecks | optional | Pay schedules (name, frequency, a recent payday, usual take-home) | Name, take-home > 0, valid date. Show the monthly estimate, "2 months a year have 3 paydays" for biweekly, and the next 3 paydays |
| 4 | Bill categories | ✓ | Categories (name, color) | At least one; names required and unique (case doesn't count as different) |
| 5 | Recurring bills | ✓ | Recurring bills (name, estimate, due day 1–28, category, autopay) | Name and estimate > 0. Show the total per month and the share of take-home pay |
| 6 | Credit cards | optional | Cards (nickname, usual due day, usual payment: full / minimum / varies) | Nickname required. Never collect card numbers |
| 7 | Investments | optional | Holdings (ticker, pay frequency, shares, current price) and brokerage cash | Ticker of 1–6 letters; shares is a number |
| 8 | Where income goes | ✓ | Starting splits from a preset | — |
| 9 | Review & finish | ✓ | — | Lists each step with Edit, Add now or Finish this; finishing links to the dashboard |

**Step 4 details:**

- Start with 7 categories: Housing, Utilities, Home, Insurance, Savings, Subscriptions, Auto.
- Offer one-tap suggestions: Medical, Pets, Kids, Debt payments, Charity, Travel, Groceries.
- Renaming a category renames it on every bill that uses it.
- Deleting a category that bills use moves those bills to the first remaining category, and a message says so.
- Tapping the color swatch cycles through the palette.

**Step 5 details:**

- One-tap suggestions: Mortgage, Rent, Electric, Water & sewer, Internet, Phone, Car insurance, Streaming, HOA dues, Gym. A suggestion is crossed out once it's used.
- The category list comes from step 4.

**Step 8 presets** (each row is savings / checking / reinvest weekly / reinvest monthly, in %):

| Preset | Options | Weekly | Monthly |
|---|---|---|---|
| Balanced | 40/20/20/20 | 0/25/75/0 | 30/20/0/50 |
| Build savings | 60/20/10/10 | 30/30/40/0 | 50/20/0/30 |
| Reinvest more | 20/10/35/35 | 0/10/90/0 | 10/10/0/80 |

---

## 4. Data model

All `id` columns are UUIDs (Aurora DSQL has no sequences). Store money as **integer cents**. Store dates as dates with no time zone. "Today" uses the household's time zone (a household setting, defaulting to the browser's on sign-up). Every record carries `household_id`. All queries are limited to the signed-in user's household.

```text
Household        id, name, mode(solo|duo), timezone, cushion_cents, first_month(YYYY-MM), created_at
User             id, email(unique), name, cognito_sub(unique), created_at   -- identity and password live in Cognito
Membership       household_id, user_id, role(owner|full|view)
Invite           id, household_id, name, email, role(full|view), note, token, expires_at(+7d), accepted_at, invited_by

Month            household_id, ym(YYYY-MM), status(open|closed), started_at, closed_at

Category         id, name(unique per household, case-insensitive), color_index, sort, archived_at

Account          id, name, type(checking|savings|cash|brokerage), is_primary_checking(bool), created_at, archived_at
BalanceSnapshot  id, account_id, date, balance_cents, note      -- "Update balance" entries
                 (brokerage value is derived from holdings + cash; a brokerage account's snapshot = its cash)

RecurringBill    id, name, estimate_cents, due_day(1..28), category_id, autopay(bool), account_id?, start_ym, end_ym?
Bill             id, ym, recurring_bill_id?, name, category_id, due_date,
                 estimate_cents?, actual_cents?, paid_at?, kind(recurring|one_time)
                 -- recurring bills create one Bill per month when the month starts; one-time bills are created directly

CreditCard       id, nickname, due_day, usual_plan(full|min|varies), archived_at
CardStatement    id, card_id, ym, statement_cents, minimum_cents, planned_payment_cents, paid_cents?, paid_at?, due_date?
                 -- no statement row yet = "no balance entered" (shows as missing, not $0)
                 -- due_date falls in month ym; empty = the card's due_day in that month (an unchanged date is stored empty)

PaySchedule      id, name, frequency(weekly|biweekly|semimonthly|monthly), anchor_date, usual_cents, account_id, ended_on?
Paycheck         id, schedule_id, expected_date, expected_cents, received_date?, received_cents?   -- generated per month
OtherIncome      id, date, source, type(side_work|sale|refund|gift|bonus|other), amount_cents, account_id, note?   -- one-time income

Holding          id, ticker(upper), pay_frequency(daily|weekly|monthly|none), shares(decimal 6dp), price_cents, price_updated_at
ShareTrade       id, date, ticker, side(buy|sell), shares, price_cents, total_cents   -- changes Holding.shares and brokerage cash

OptionTrade      id, ticker, kind(put|call), strike_cents, expiration, contracts, open_date, premium_cents,
                 status(open|expired|closed|rolled|assigned), close_date?, close_cost_cents?, rolled_from_id?
DividendPayment  id, date, ticker, amount_cents, income_type(weekly|monthly)   -- daily payers are income_type=weekly

SplitSetting     id, effective_ym, income_type(options|weekly|monthly),
                 savings_pct, checking_pct, reinvest_weekly_pct, reinvest_monthly_pct   -- sum = 100
MoneyMove        id, ym, week(1..4), bucket, moved_cents, done_at?, note
CarryIn          household_id, ym, bucket, amount_cents    -- written when a month starts (from the prior month's week-4 carry-out)
```

**Indexes and constraints:**

- Unique keys: `(household_id, ym)` on Month; `(ym, week, bucket)` on MoneyMove; `(card_id, ym)` on CardStatement; `(schedule_id, expected_date)` on Paycheck.
- Deleting a category that bills use requires choosing where those bills move.
- Deleting or ending a recurring bill or pay schedule never removes rows from past months.

---

## 5. Rules and calculations

These rules define the numbers on every page, so implement them as **one shared domain module** with unit tests (§10). Pages must not recompute any of them their own way.

### 5.1 Weeks

`week(date)` = 1 for days 1–7, 2 for 8–14, 3 for 15–21, and 4 for day 22 to the end of the month. Every investment payment, buy-back cost and move belongs to the week of its date.

### 5.2 Splits by month

- `splitsFor(ym, income_type)` returns the SplitSetting with the latest `effective_ym ≤ ym`.
- Saving new splits asks "Apply from" (this month or next month) and creates a new SplitSetting row. Earlier months keep their own splits.
- The Allocation settings page shows the history table "Splits by month".

### 5.3 Investment income

- **Options for a week:**
  - Plus: the premiums of trades opened that week.
  - Minus: buy-back costs (`close_cost`) paid that week.
- **Options status changes:**
  - `expired`: no cost.
  - `closed`: enter the buy-back cost and date.
  - `rolled`: close the old trade at a cost and open a new trade linked by `rolled_from_id`. The new trade's premium counts in its own open week.
  - `assigned`: record the date. **Do not change holdings.** Show a link to Accounts to record the share trade.
- **Weekly/daily and monthly dividends:** the sum of DividendPayments in the week. A holding's pay frequency decides whether its payments count as `weekly` or `monthly`.
- **A month's investment income** = the sum of its weeks. It can't go below zero for a type in a week. If buy-backs exceed premiums, the options value is shown negative and the moves for that week are $0.

### 5.4 Money moves (weekly, per bucket)

```text
new[w][b]     = Σ over income types t: income[w][t] × splitsFor(ym, t)[b] / 100
available[w][b] = carryIn[w][b] + new[w][b]
moved[w][b]   = MoneyMove.moved_cents (0 if not done)
carryOut[w][b]  = available[w][b] − moved[w][b]
carryIn[1][b] = CarryIn(ym, b)            (from last month's week-4 carryOut)
carryIn[w+1][b] = carryOut[w][b]
```

- Round each bucket's `new` amount to cents. If rounding leaves a cent over, add it to the bucket with the largest share.
- **Checking off a move** records `moved = available` by default.
- **"Moved a different amount"** lets the user enter less than available, and the rest carries over. Moving more than available is rejected.
- Unchecking a move deletes its moved amount.
- The **week card** shows carry-in, + new, = available, moved and carries over, plus a total row.
- The month header shows "Carried in from {prev}" and "Carries into {next}".
- The **sidebar card** "This week's money moves" shows the current week: "{done} of 4 done · ${total available} ready to move".

### 5.5 Reinvest buy suggestions

The two reinvest buckets get a suggestion of what to buy with that bucket's available cash:

- `reinvest_weekly` draws from holdings that pay daily or weekly.
- `reinvest_monthly` draws from holdings that pay monthly.

Only holdings with a price above zero count. Goal: **buy as many different tickers as possible first, then as many shares as possible.**

```text
items = eligible holdings sorted by price ascending; rem = cash
1. Variety: walk cheapest→dearest; buy 1 of each while price ≤ rem. If none affordable → "Not enough for a share; carries over".
2. Volume: put all remaining cash into extra shares of the cheapest ticker (floor).
3. Upgrade: while the cheapest has >1 share, find another already-bought ticker whose price difference
   (its price − cheapest price) ≤ rem, choosing the largest difference; swap one cheapest share for one of it.
   Stop when no swap fits.
Output: "Buy 1 JEPQ, 1 BTCI, 1 EGGY, 4 CONY = $134.07 · $6.18 stays (4 of 4 tickers · 7 shares)"
```

- The suggestion uses current prices. Show a "Prices" panel to update them, with "updated {n} days ago" for each.
- **"Use" fills the move amount with the suggestion's total. It never changes holdings.** The leftover ("stays") carries over.

### 5.6 Money in, money out, kept

```text
moneyIn(ym)  = Σ Paycheck(ym): received_cents if received else expected_cents
             + Σ OtherIncome in ym
             + Σ MoneyMove(ym, bucket=checking).moved_cents          ← actual moved, not planned
moneyOut(ym) = Σ Bill(ym): actual_cents ?? estimate_cents
             + Σ CardStatement(ym).planned_payment_cents             (cards with no statement count 0 and show "missing")
kept(ym)     = moneyIn − moneyOut
spentPct(ym) = round(moneyOut / moneyIn × 100)
status       = spentPct ≤ 85 → "Within means" (green) | 86–100 → "Tight" (amber) | > 100 → "Over" (orange)
```

- Expected paychecks count until they're marked received. Then the received amount replaces the expected one; never add both.
- The **year totals** are the sums of the months. The verdict banner: "You've spent {spentPct}% of what came in. {Over months} went over. {n} months ({names}) ran tight." It also shows "Saved so far: {kept YTD}".
- Investment income is shown in full on its own tiles and charts, with "{X} ({pct}%) moved to checking counts as money in".

### 5.7 Bills covered by investment income

```text
recurring = this month's recurring Bills, sorted by amount ascending (estimate or actual)
covered   = Σ MoneyMove(ym, checking).moved_cents        (actual)
walk the list keeping a running total; a bill is Full if running ≤ covered, Partial if it straddles, else Not yet.
Headline: "{full} of {count} bills fully covered"; "{covered} moved to checking so far ({planned} planned)"
planned  = Σ over types: income[t] × splitsFor(ym,t).checking / 100   (shown as projection only)
Next bill to cover: first non-full bill and the amount still needed; also "to cover every recurring bill: {total − covered} more a month".
Trend: % of recurring total covered, per month of the year.
```

### 5.8 Accounts and the checking forecast

- **Checking, savings and cash:** the balance is the latest BalanceSnapshot.
- **"Update balance"** compares the entered balance with the expected balance (the last snapshot plus recorded flows since). If they differ, it shows the gap, e.g. −$14.80, and offers two choices:
  - (a) log the gap as a one-time bill or one-time income;
  - (b) just accept the new balance.
- **Brokerage value** = Σ shares × price + brokerage cash.
  - Brokerage cash = last cash snapshot + reinvest moves in − buys + sells since that snapshot.
  - The buy/sell form warns when a buy costs more than the cash in brokerage.
- **Checking forecast** for each day to the end of the month, plus 2 weeks:
  - Start from today's checking balance.
  - Add expected paychecks on their dates and any one-time income.
  - Add checking moves when they're done.
  - Subtract unpaid bills on their due dates and planned card payments on each statement's due date (§5.10).
  - Show the lowest point and compare it to the cushion: "Lowest $1,072.12 today · $72.12 above your $1,000 cushion".
  - Include a "What if a paycheck is late?" toggle that shifts the next payday by a week.
- **"Balances out of date"** applies when checking or savings hasn't been updated in more than 7 days. It shows in the dashboard's This week list.

### 5.9 Paychecks

- Generate the expected Paychecks for a month from each active schedule:
  - **Biweekly:** every 14 days from the anchor date.
  - **Weekly:** every 7 days.
  - **Semimonthly:** the 1st and 15th, or the next business day.
  - **Monthly:** the anchor's day of the month.
- **Mark received:** enter the actual amount (prefilled with the expected amount) and the date. The date can be early.
- **Stop this paycheck** sets `ended_on`; future expected paychecks disappear and past ones stay. A stopped schedule can be restarted.

### 5.10 Credit cards

- Each month, for each active card, enter the statement balance, the minimum and the planned payment. The planned payment defaults to the card's usual plan.
- The planned payment can't be more than the statement balance, and the minimum can't be more than the balance.
- **Payment due date:** each month's statement has its own. It starts at the card's due day in that month (a shorter month uses its last day) and can be changed to any day of that month, without changing the card or other months. A card with no statement, or a statement saved without a date, uses the card's due day.
- Mark paid with the amount paid. **Any unpaid amount** (statement minus paid) shows as carried on next month's card row, as "carries $187.43".
- **Missing statement:** a card past its usual statement day (usually around the 17th) with no row is flagged in This week.

### 5.11 Months: start and close

Design: `StartMonth.dc.html`

**The "Start {next month}" flow** (4 steps):

1. **Wrap up {this month}:** list unpaid bills and unmarked paychecks. For each, choose mark paid, move to next month, or drop.
2. **What carries over:** each bucket's carry-out (written to CarryIn) and unpaid card balances.
3. **Preview {next month}:** recurring bills generated at their estimates, expected paychecks (with a "3 paydays" note), and splits (current or newly saved).
4. **Start:** closes this month and opens the next.

**Opening a month** is one idempotent domain operation, `openMonth(ym)`, run in a single transaction: it creates the Month row, one Bill per active recurring bill, the expected Paychecks, and the CarryIn rows. Only the user opens months — setup step 1 opens the first month, and the Start flow opens each next month. No background job ever opens a month; if the user hasn't started a new month, it stays "Not started" until they do. Until the Start flow exists (Phase 4), an "Open {month}" button on Bills calls `openMonth`.

**Closed months** are read-only. "Unlock" on Bills reopens one month for edits. Edits flow through to later carry-ins: recalculate on the fly, or re-run the carry when the month is locked again.

**A future month** shows "Not started", with a preview built from recurring bills and schedules.

### 5.12 Year in review

Design: `YearEnd.dc.html`

- **Data:** the year's months. The current year is a **preview**; the review is final on January 1.
- **Future months** are **projected**:
  - Money in: expected paychecks + the average checking moves of the last 3 months.
  - Money out: recurring estimates + the average one-time bills of the last 3 months.
  - Projected months show as dashed bars, marked "projected".
- **Sections:**
  - **Verdict:** months within means out of 12, the share of money in that was spent, and how much more or less was kept than the previous year.
  - **Totals:** money in, money out, investment income and kept, each compared with the prior year when one exists.
  - **Kept-per-month chart:** positive months teal, negative months orange. Clicking a month shows its details and a note.
  - **Highlights:** best month, toughest or tightest month, investment income growth, biggest category increase.
  - **Investment income:** totals by type and by bucket, using each month's own splits.
  - **Bills covered:** January vs. the latest month, and the trend.
  - **Spending by category:** each category's total, its share, and the change vs. the prior year.
  - **Balances:** January 1 vs. December 31 for each account, with card debt shown as "less owed".
  - **Getting ready for next year:** the amount to checking needed to cover the next bill, bills that ran over their estimate most months, setting money aside for one-time bills, and Start January.
- **Download PDF:** exports the whole review. A preview is watermarked "Preview".

### 5.13 This week

The dashboard (§6.1) and phone Home (§6.15) show **This week**: the items due in the next 7 days, from one pure domain function `dueSoon(household, today)` computed when the page loads. There are no reminders or notifications (out of scope).

| Item | Shows when |
|---|---|
| Bills you pay yourself | Unpaid and due within 7 days |
| Autopay bills | Due within 7 days (heads-up) |
| Card payments | Planned payment's due date (§5.10) within 7 days |
| Missing card statement | 3 days past the card's usual statement date with no statement row |
| Paycheck not marked received | The day after its expected date |
| Weekly money moves | Any bucket in the current week with money available |
| Options expiring | Expiration within 7 days |
| Checking below cushion | The forecast (§5.8) drops below the cushion within 2 weeks |
| Balances out of date | Checking or savings not updated in more than 7 days |

Each item has its action: Mark paid, Mark received, Open, or Enter balance.

### 5.14 Quick Add

Design: `QuickAdd.dc.html`

- One "+ Add" button (sidebar on desktop, center tab on phone) opens a modal with 8 types:
  - Bill (paid / still owed)
  - Other income
  - Paycheck received
  - Dividend
  - Options premium
  - Card balance
  - Account balance
  - Buy or sell shares
- Each type's form is the same as the full form on its page, and saves the same record.
- After saving, show which week, month and page the entry landed in.

---

## 6. Screens

Desktop-first, with a left sidebar. The nav links are Dashboard, Bills & cash flow, Recurring bills, Paychecks & income, Accounts, Investment income and Allocation settings. Above them is the "+ Add" button; below them, the "This week's money moves" card. On phone the sidebar becomes a tab bar (§6.15). A month navigator (‹ Month › with a status chip) appears on Bills, Paychecks and Investment income.

### 6.1 Dashboard — `Main.dc.html`

- **Header:** greeting; year switcher (previous / current / next; next shows an empty state); "Year in review" button; "Add entry" button.
- **Verdict banner:** §5.6.
- **This week** (current year only): the next 7 days from `dueSoon()` (§5.13), plus the checking forecast line.
- **Year tiles:** money in, total spent, savings rate (% of money in kept), investment income (with growth since January and the share moved to checking).
- **Month view:**
  - Month picker: 12 chips, each with net in $k; tight months tinted; future months disabled. Prev/next buttons.
  - Cards: Money in (paychecks & other + investments moved to checking, with a note on the investment total); Money out (spent %, status chip); Net for the month (savings rate, bills covered); Investment income moved (by type and bucket).
  - Changes vs. the previous month.
- **Money in vs. money out chart:** a bar pair per month. Clicking a month selects it.
- **Recurring bills paid by your investments:** §5.7, with a stacked bar of bills sized by amount, the ladder table, the next-bill box, the planned split breakdown and a 12-month trend.
- **Investment income by type:** a stacked monthly chart.
- **Where it went:** year totals by bucket.
- **Month-by-month table:** paychecks & other, moved to checking, expenses, net, status chip.

### 6.2 Bills & cash flow — `Bills.dc.html`

- **Month navigator:**
  - A closed month is locked, with "Unlock".
  - A future month shows "Not started" and a preview.
- **Tiles:** bills + cards this month; paid so far (progress bar); Left after bills = money in − money out (§5.6).
- **Weeks 1–4:** collapsible, with Expand all / Collapse all.
  - Each bill row: name, category chip, due date, estimate or actual, autopay, paid toggle, edit, delete with confirmation.
  - The current and later weeks start open.
- **One-time bill form:** name, amount, date, category, paid or still owed.
- **Credit card balances form:** §5.10, one row per card.
- **By category:** totals for the month; credit cards appear as their own line.
- **Paychecks card:** received and expected paychecks, plus one-time income.
- **How {month} adds up:**
  - Paychecks & other income + investments moved to checking − bills & cards = net.
  - Also a note: "Of $X investment income, the rest goes to savings and reinvesting".

### 6.3 Recurring bills — `Recurring.dc.html`

- **Bill list:** name, estimate, due day, category, autopay, edit and delete. Add-bill form.
- Ending a bill keeps its history; it can be restarted.
- **Categories manager:** add, rename, recolor and delete, with the in-use rules in §4.

### 6.4 Paychecks & other income — `Paychecks.dc.html`

- **Schedules:** add or edit; stop or restart.
- **This month's paydays:** mark received with the amount and date.
- **One-time income:** list and form (source, amount, date received, type, deposited into, optional note).
- **Month navigator.**

### 6.5 Accounts — `Accounts.dc.html`

- **Account tiles.**
- **Checking forecast:** chart and lowest point, the cushion editor and the late-paycheck what-if.
- **Update balance:** with the reconcile gap (§5.8). Add-account form.
- **Brokerage holdings table:**
  - Columns: ticker, pays, shares (editable), price (editable, with updated date), value.
  - Buy/sell form and brokerage cash.

### 6.6 Investment income & money moves — `Income.dc.html`

- **Tabs:** Options (the default), Weekly & daily, Monthly.
  - **Options:** a trade list with status chips. "Log a trade" form: date, ticker, put/call, strike, expiration, contracts, premium. An action panel per open trade: expired, close (cost), roll (cost + new trade), assigned.
  - **Weekly & daily:**
    - Per ticker. Daily payers (STRC) get a whole-week grid, Mon–Fri, for the selected week. Leave a day blank if nothing paid; saving replaces that week's days.
    - Also a single-payment mode: date and amount.
    - Add a new ticker with its frequency.
  - **Monthly:** payments by ticker, with a "{n} of {m} paid this month" count.
- **Money moves:**
  - Carry-in from the previous month.
  - Week cards 1–4, the current week open: 4 bucket rows, each with available, a suggestion, a "Use" button, an amount moved and a done checkbox. A total row.
  - Carry-out to the next month.
- **Prices panel:** §5.5.
- **Past and future months:** summary stats; future months show a preview.

### 6.7 Allocation settings — `Settings.dc.html`

- **Split editors:** three income types, each with 4 sliders and number inputs. They must total 100%; show the remainder live.
- **"Apply from"** (this month / next month) and Save.
- **"Splits by month"** history table.
- No reinvest-targets section (removed).

### 6.8 Start a new month — `StartMonth.dc.html`

§5.11, with a 4-step stepper.

### 6.9 Quick Add — `QuickAdd.dc.html`

§5.14. Opens as a modal over any page.

### 6.10 How the data connects — `DataMap.dc.html`

A reference diagram only, not a page to build. It agrees with §5.

### 6.11 Year in review — `YearEnd.dc.html`

§5.12. Reached from the dashboard header.

### 6.12 Reminders — removed

Out of scope. The `Reminders.dc.html` artboard is not built.

### 6.13 Sign in & setup — `SignIn.dc.html`, `Setup.dc.html`

§3.

### 6.14 Empty states — `EmptyStates.dc.html`

Every page has an empty state with three parts:

- **(a) Main panel:** icon, title, one sentence, one main button, and at most one alternative.
- **(b) Preview:** a faded dashed preview of what will appear, showing $0.00 values.
- **(c) Section states:** smaller states for single sections inside a page that otherwise has data, such as "Nothing due this week", "Nothing to move this week", "No open trades", "Add prices to get suggestions".

The dashboard's empty state adds a "Your first month" checklist: finish setup, mark the first paycheck, log investment income, enter card balances, add holdings if skipped.

Tone rules:

- Good news ("all caught up") is teal.
- Only information the user still needs to enter is amber.
- Never show a blank number or an endless spinner.

### 6.15 Phone — `Phone.dc.html`

- **Tab bar:** Home, Bills, Add (raised center button), Income, More. More holds Paychecks, Recurring bills, Accounts, Allocation settings and Year in review.
- **Phone-specific screens:**
  1. **Home:** the month verdict (in / out / kept, spent bar), the checking forecast line, and This week with inline actions.
  2. **Paychecks:** "It landed — mark received" opens a bottom sheet with a large amount field, the date (early or on time) and Mark received. Afterward it shows the new money-in total, the difference from expected, and Undo.
  3. **Log income:** type tabs, ticker chips, a Mon–Fri grid for daily payers, a large amount field, "Same as Tue" chips and a live split preview. For options, the premium screen leads on to strike and expiration.
  4. **Money moves:** the amount left to move with a progress bar, then 4 checkable moves with suggestions and "Moved a different amount".
- **Every other page** stacks into a single column: tables become cards and charts scroll sideways.
- **Forms** open as bottom sheets with numeric keyboards (`inputmode="decimal"`).

---

## 7. Visual design

- **Look:** warm and friendly, with an ocean-teal accent.
- **Fonts:** **DM Sans** for the interface and **Fraunces** for headings and big numbers. Use tabular figures for money.

| Token | Hex | Use |
|---|---|---|
| bg | `#FBF6EE` | page |
| surface | `#FFFDF8` | cards |
| sidebar | `#F3EADC` | nav, subtle panels |
| border | `#EDE4D6` / `#E3D8C6` | card / input borders |
| ink | `#2B2520` | text |
| ink-2 | `#4A4038` | secondary text |
| muted | `#6E6258` | captions |
| primary | `#0F6E74` | buttons, links, success |
| primary-soft | `#E3F1EF` | good-news panels |
| income (chart) | `#00929C` | money in bars |
| expense (chart) | `#C9610E` | money out bars, "Over" |
| options | `#6B57C9` | |
| weekly/daily | `#A87A00` | also reinvest weekly |
| monthly | `#C2417F` | also reinvest monthly |
| savings bucket | `#0F6E74` | |
| checking bucket | `#8A7D70` | |
| warning bg / text | `#FFF8EC`, `#FBEFD6` / `#7A4F00` | Tight, missing info |
| error text | `#A63A12` | validation |
| ok chip | `#E4F2E8` / `#1B6B42` | Within means |

**Category colors**, in order: `#0F6E74`, `#00929C`, `#A87A00`, `#6B57C9`, `#2F5F62`, `#C2417F`, `#9C5B3B`, `#C9610E`, `#8A7D70`.

**Accessibility:**

- Body text contrast ≥ 4.5:1.
- Touch targets ≥ 44px.
- Visible focus rings (2px primary).
- Every icon button has an aria-label.
- Errors use `role="alert"`; confirmations use `role="status"`.
- Charts have text equivalents (aria-label or readouts).

**Formatting:**

- Money in US dollars: `$1,234.56`. Negatives use a true minus sign, as in `−$923`.
- Year-level tiles may round to whole dollars.

---

## 8. Requirements for any tech stack

- A web app that works well at 1440px desktop width and at 390px on phones (responsive, not a separate app). Installable as a PWA (home-screen icon, full-screen); no push.
- **Auth:** email and password with secure hashing, sessions, password reset by email, and invite tokens. Passkeys are optional later.
- **Isolation:** each household's data is separate. Enforce it in the data layer as well as the UI. Aurora DSQL has no row-level security we rely on, so the equivalent is a tenant-scoped repository layer (§12): every query goes through it with a `HouseholdContext` taken from the verified login, and an isolation test suite proves one household can't read or change another's data.
- **Database:** relational and transactional. Money moves, month start and share trades are each one transaction (with retry on DSQL's optimistic-concurrency conflicts).
- **Domain logic:** one shared module for everything in §5, with unit tests. The UI, the API, the PDF export and `dueSoon()` all call it.
- **Background jobs:** only the nightly household JSON export to backup storage. Months open only through the user's flow (§5.11); "Balances out of date" is computed on page load (§5.13).
- **Email** for partner invites (SES) and password reset (Cognito). No other email.
- **PDF export** for Year in review, generated in the browser.
- **Privacy:**
  - Never collect card or account numbers. Nicknames only.
  - Log no financial amounts to third parties.
  - Back up the database daily.
  - Provide a full JSON export of the household's data.
- **Time zone:** "today" and week boundaries use the household's time zone.

---

## 9. Build phases

Each phase ends with its acceptance tests in §10 passing and the screens matching the design.

**Phase 0 — Walking skeleton**

- Repo, CI and coverage gates; AWS account setup; every CDK stack; Cognito sign-in; one API call that reads DSQL; custom domain and certificate; daily backups; deployed to dev and prod.

**Phase 1 — Foundation**

- Auth: sign up solo or with a partner, invite and accept, sign in, roles.
- Household, Month, Category, Account, BalanceSnapshot.
- App shell: sidebar, tab bar, month navigator.
- First-time setup wizard steps 1, 2, 4, 5 and 9. The other steps can show "coming soon" and be skipped.
- Household JSON export and the nightly backup export.

**Phase 2 — Bills and paychecks (the "within means" core)**

- Recurring bills and categories; `openMonth` (Bill and Paycheck generation); one-time bills.
- Credit cards and statements.
- Pay schedules, paychecks and other income.
- Bills & cash flow page; Recurring bills page; Paychecks page.
- Money in and money out (§5.6) using paychecks and one-time income only. Moved-to-checking is 0 until phase 3.
- Setup steps 3 and 6. Quick Add for bill, other income, paycheck and card balance.

**Phase 3 — Investments and money moves**

- Holdings, ShareTrade, brokerage value, prices. Setup step 7.
- OptionTrade with its lifecycle; DividendPayment, including the daily week grid.
- SplitSetting with "apply from"; Allocation settings; setup step 8.
- Money moves with carry-over and reinvest suggestions (§5.4–5.5).
- Moved-to-checking now feeds money in; bills covered (§5.7).
- Investment income page. Quick Add for dividend, options, account balance and buy/sell.

**Phase 4 — Dashboard, accounts and months**

- Dashboard: every section in §6.1, the year switcher, the month view and This week (§5.13).
- Accounts page with the checking forecast and reconcile (§5.8).
- The Start a new month flow, closing and locking months, Unlock (§5.11).

**Phase 5 — Year in review**

- Year in review with projections and in-browser PDF export.

**Phase 6 — Phone polish and empty states**

Every screen is responsive (1440px and 390px) and has its main empty state from the phase it's built in. Phase 6 adds:

- The phone-only screens and bottom sheets from §6.15.
- The remaining empty-state previews, section states and the "Your first month" checklist from §6.14.
- Final accessibility pass.

---

## 10. Acceptance tests (seed data and expected numbers)

Seed a household named "Our household" with John (owner) and a partner (full access). Fix **today as Wed, Nov 18, 2026**. Use these sample records. They're the same numbers shown in the design.

**Recurring bills** (12 bills, $2,750/month):

| Bill | Amount |
|---|---|
| CD contribution · 1 | $20 |
| CD contribution · 2 | $20 |
| Streaming | $36 |
| Lawn supplies | $45 |
| Water & sewer | $68 |
| Internet | $80 |
| Phone | $95 |
| HOA dues | $110 |
| Pool service | $120 |
| Car insurance | $142 |
| Electric | $164 |
| Mortgage | $1,850 |

**Pay schedule:** "Main job", biweekly, anchored Fri Nov 6, 2026, usual $3,225.00.

- Nov 6: received $3,272.18.
- Nov 20: expected.

**One-time income in November:** $534.20, from 3 entries.

**Splits:** Balanced preset, effective 2026-01.

**Holdings** (pay frequency, price):

| Ticker | Pays | Price |
|---|---|---|
| STRC | daily | $98.40 |
| QDTE | weekly | $31.20 |
| YMAX | weekly | $13.85 |
| XDTE | weekly | $41.10 |
| BTCI | monthly | $24.52 |
| EGGY | monthly | $20.95 |
| CONY | monthly | $7.80 |
| JEPQ | monthly | $57.40 |

**November investment income:** options $960.00, weekly/daily $278.73, monthly $674.45, for a total of $1,913.18.

**Carry-in from October:** savings $0, checking $12.40, reinvest weekly $18.75, reinvest monthly $41.20 (total $72.35).

| # | Test | Expected |
|---|---|---|
| T1 | `week()` for Nov 1, 7, 8, 21, 22, 30 | 1, 1, 2, 3, 4, 4 |
| T2 | Nov paychecks + other income (Nov 20 still expected) | $7,031.38 |
| T3 | Nov 20 marked received at $3,248.60 | paychecks + other = $7,054.98 (expected replaced, not added) |
| T4 | Nov money moves, week 3 available | savings $71.76, checking $50.93, reinvest weekly $14.20, reinvest monthly $140.25, for a total of $277.14 |
| T5 | Reinvest weekly suggestion for $14.20 | "Buy 1 YMAX = $13.85 · $0.35 stays" |
| T6 | Reinvest monthly suggestion for $140.25 | "Buy 1 JEPQ, 1 BTCI, 1 EGGY, 4 CONY = $134.07 · $6.18 stays (4 of 4 tickers · 7 shares)" |
| T7 | Week 3 reinvest weekly: moved $13.85 instead of $14.20 | $0.35 carries to week 4 |
| T8 | Nov checking moved so far = $358.05 | Nov money in = $7,031.38 + $358.05 = **$7,389.43**; money out **$5,639.57**; kept **$1,749.86**; spent **76%**; Within means |
| T9 | Bills covered with $358.05 | 6 of 12 fully covered (the six smallest total $269; Phone at $95 is partial, $89.05 of $95); 13% of $2,750 |
| T10 | Planned checking share for Nov | $960×20% + $278.73×25% + $674.45×20% = $396.57 (projection only) |
| T11 | March 2026: paychecks & other $6,200, investments 810/340/550, money out $7,480 | moved to checking $357.00 → money in $6,557; kept −$923; status **Over** (114%) |
| T12 | Status thresholds | 85% → Within means, 86% → Tight, 100% → Tight, 101% → Over |
| T13 | Splits saved in 2025-07 that change weekly checking from 30% to 25% | Jan–Jun 2025 use 30%, Jul onward use 25%; past months unchanged |
| T14 | Option closed: AMD put, premium $246 opened Nov 10, bought back for $96 on Nov 18 | week 2 options +$246; week 3 options −$96 |
| T15 | Option assigned | holdings unchanged; Accounts shows a "record the shares" prompt |
| T16 | "Use" on a suggestion | the move amount is set; Holding.shares unchanged |
| T17 | Card statement $1,471.60, paid $1,284.17 | next month shows "carries $187.43" |
| T18 | Delete category "Home", used by 1 bill | the bill moves to the first category; a message confirms it |
| T19 | Partner invite with the user's own email | rejected: "Use your partner's own email…" |
| T20 | Solo account | no partner invite option anywhere after sign-up |
| T21 | View-only member | every create/edit/delete control hidden and rejected by the API |
| T22 | Year in review 2026, with December seeded as the design's projection (paychecks $6,450, investments 920/300/690, money out $5,980) | 11 of 12 months within means; kept $13,034; money in $81,773; investment income $21,818 |
| T23 | Year in review 2025 | August 2025 Over (−$200); 11 of 12 within means; kept $9,293 |
| T24 | Start December | November closes and locks; CarryIn(Dec) = November week-4 carry-out per bucket; December Bills and Paychecks generated (Dec 4 and Dec 18) |

---

## 11. Open questions (it's fine to proceed with these defaults)

1. **Price updates:** manual in v1, behind a `PriceSource` interface so an API can be plugged in later.
2. **Semimonthly paydays:** the 1st and 15th by default; let the user change the two days.
3. **Projection method for future months:** the averages of the last 3 months (§5.12). Make the window a constant.
4. **Due days 29–31** aren't allowed; recurring bills use 1–28. If a user needs "last day of the month", add it as a separate option later.

---

## 12. Platform & hosting (decided)

Decided in planning on Nov 19, 2026. Each decision has a record in the repo under `docs/adr/`.

- **Hosting:** AWS, region us-east-2 (Ohio), staying within Always Free services. The account moves from the Free plan to the Paid plan (with a $1 budget alert) before the Free plan ends on 2027-11-12.
- **Stack:** TypeScript monorepo — `packages/domain` (all §5 rules, pure functions), `packages/db` (Kysely, the only package that touches the database), `packages/api` (tRPC + Zod on one Lambda behind API Gateway HTTP API), `packages/web` (React + Vite single-page app and PWA), `packages/infra` (AWS CDK).
- **Database:** Aurora DSQL (Postgres-compatible, Always Free up to 100k DPUs and 1 GB a month). No sequences, triggers or row-level security; UUID keys; schema migrations each in their own transaction; a migration linter rejects unsupported features.
- **Isolation:** every repository function takes a `HouseholdContext { householdId, userId, role }` built from the verified Cognito token and the user's Membership; writes reject the `view` role; a lint rule stops any other package importing the database driver.
- **Auth:** Amazon Cognito (Essentials) for login, password rules, reset and refresh tokens, with our own sign-in screens. Household, Membership and Invite stay in the database.
- **Web:** S3 + CloudFront at `within.doroshenk.com` (prod) and `dev.within.doroshenk.com` (dev), via CNAME records at Network Solutions and a free ACM certificate. `/api/*` routes to API Gateway through the same distribution.
- **Email:** SES sending from `no-reply@within.doroshenk.com` (DKIM on the subdomain), used only for partner invites.
- **Dates and money:** business dates are calendar dates (`Temporal.PlainDate`, SQL `DATE`); "today" comes from an injected clock in the household's time zone; money is integer cents everywhere.
- **Backups:** daily AWS Backup of DSQL (14-day retention) plus the nightly JSON export to a private, versioned S3 bucket (90-day retention). Logs never contain amounts.
- **Environments and delivery:** `dev` and `prod` in one account. GitHub Actions with OIDC: PR checks block merges; merging to `main` deploys dev; a version tag deploys prod.
- **Testing:** test-first (red, then green). Coverage gates: domain 100% lines and branches plus a Stryker mutation score of 90% or more; db and api 95/90; web 85/80. Repository tests run on Postgres in Docker; a DSQL conformance run checks the same suite on the real dev cluster after each merge.
