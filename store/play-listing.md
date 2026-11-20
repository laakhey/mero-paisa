# Google Play listing — Mero Paisa

Drafts for Play Console. Fields in [BRACKETS] need your input.

## Main store listing

**App name** (max 30): `Mero Paisa: Expenses & Split`

**Short description** (max 80):
`Track spending, set budgets and split bills with friends. Private by default.`

**Full description** (max 4000):

```
Mero Paisa is your personal money diary: quick to use every day, clear at the end of the month, and private by default.

TRACK EVERY RUPEE
• Add expenses, income and transfers between accounts in seconds
• Your most-used categories are always one tap away
• Tag transactions with labels like #vacation or #work-trip
• Search everything you have ever spent

KNOW WHERE YOUR MONEY GOES
• Monthly overview with total balance, income, spending and net
• Reports with six-month trends and a breakdown by category
• Tap any category to see its history and every transaction
• Swipe between months

STAY ON BUDGET
• Set monthly limits per category
• See what is left to spend, and a daily allowance for the rest of the month

YOUR DATA, YOUR CHOICE
• Works fully offline, with no account needed
• Optional sync across your devices with Google sign-in
• Fingerprint or face lock
• Backup and restore, plus CSV export and import for spreadsheets
• No ads, no tracking
• Delete your cloud data or account any time from the app

Light and dark themes, any currency.

SPLIT BILLS WITH FRIENDS
• Groups for trips, flats and dinners; friends do not need the app
• Split equally, by amount or by shares
• See who owes whom in the fewest payments, and mark them paid
• Share the summary to any chat app
• Your share goes into your own expenses automatically

Mero Paisa is made by Laakhey.
```

**App icon:** `store/icon-512.png` (512×512)

**Feature graphic:** 1024×500, still to be made.

**Phone screenshots:** 2–8 (portrait). Suggested: Home overview, Activity with labels, Reports, category details, Budgets, Settings with sync.

**Category:** Finance
**Tags:** Budget, Expense tracker, Personal finance
**Contact email:** [CONTACT EMAIL]
**Privacy policy URL:** [URL where store/privacy-policy.md is published]

## App content forms

### Privacy policy
The URL above.

### App access
"All functionality is available without special access." Sign-in is optional and only enables sync; reviewers can use every feature without it.

### Ads
No, the app does not contain ads.

### Content rating (questionnaire)
Category: Utility / productivity. No violence, sexual content, gambling, user-generated content shared publicly, or location sharing. Expected rating: Everyone / PEGI 3.

### Target audience
18 and over (it handles personal finances). Not designed for children.

### Data safety
| Question | Answer |
| --- | --- |
| Does the app collect or share user data? | **Yes**, it collects data (only when the user turns on sync) |
| Is all data encrypted in transit? | **Yes** |
| Can users request data deletion? | **Yes**: in the app (Delete account) and by email |
| Shared with third parties? | **No**: service providers acting for you (Google sign-in, Supabase) are not counted as sharing |

Data types collected:

| Data type | Collected | Optional? | Purpose |
| --- | --- | --- | --- |
| Personal info → Email address | Yes | Optional | Account management |
| Personal info → Name | Yes (from Google profile) | Optional | Account management |
| Financial info → Other financial info (user-entered transactions, budgets, accounts) | Yes | Optional | App functionality |

Not collected: location, contacts, photos, device IDs, app activity, crash logs, diagnostics.

### Account deletion
- **In-app path:** Settings → Cloud sync → Delete account
- **Web link:** the "Deleting your data and account" section of the privacy policy URL

### Financial features declaration
"My app doesn't provide any financial features" is **not** right, because the declaration covers personal finance tools. Choose the option for **personal finance management / budgeting tools** that do not move money, give loans, or connect to bank accounts. Read Google's current wording carefully when filling it in.

### Government apps, news, health, COVID-19
Not applicable.

## Release checklist

1. Create the app in Play Console with package `com.laakhey.meropaisa`.
2. Publish the privacy policy and fill in [CONTACT EMAIL], [REGION] and [DATE].
3. Build the AAB: `npx eas-cli@latest build --platform android --profile production`.
4. Upload it manually to **Testing → Internal testing** (the first upload must be manual).
5. Fill in every App content form above.
6. Run the closed test Google requires for new personal developer accounts, then apply for production.
7. Later uploads: `npx eas-cli@latest submit --platform android` with a Google Cloud service-account key.
