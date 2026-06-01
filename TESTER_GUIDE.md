# Orkora Private Beta Tester Guide

Hi, and thank you for testing Orkora with us before the public launch. This guide is everything you need to start poking at the product, what we want you to try, what we already know is rough, and how to flag anything that surprises you. It should take about ten minutes to skim and roughly an hour to work through the scenarios.

If you only read one thing: **everything you do here is on test mode and does not move real money**. Use only the test card details at the bottom of this guide. Sign in with whatever email you check; we use a one-time-code login (no password to manage).

---

## What Orkora is

Orkora is an event management platform for organizers who want to run a single event end to end: publish a landing page, sell tickets, check attendees in at the door, run a live chat / Q&A / polls during the event, and process refunds when things change. We are designed for African market organizers (NGN / GHS / KES / ZAR) but support USD as well.

You are testing the private beta build. That means the core flows are real and working; the polish and the legal/compliance copy is intentionally still in draft.

---

## How to get in

Open this in your phone or laptop browser:

**`https://orkora-api.vercel.app`**

Click **Start planning** (or **Sign in** if you have already been added). On the sign-in screen, type your email and click the button; you will get a six-digit code in your inbox within thirty seconds. Type the code and you are in. There is no password; the code is your sign-in for this session.

The first time you sign in we create a personal account for you. To run events you also need an **organization**. If you do not already see one in the top-left switcher, create one from the settings page; takes about a minute.

---

## What we want you to try

We have prioritised these in order. Doing the first two is the highest-value thing; the rest are bonus.

### 1. Create and publish an event (organizer flow)

1. From the dashboard, **+ New event** in the top right.
2. Fill in the basics: title, dates, timezone, format (in person / virtual / hybrid). Save.
3. On the event page, add at least one **ticket tier** (Free is fine for a first pass), one **track**, one **session**, one **speaker**, and upload a **banner**.
4. **Publish** the event.
5. Open the public landing in an incognito window: `https://orkora-api.vercel.app/e/<EVENT-CODE>` (the code is shown on your dashboard).

What we are watching for: does the editor feel obvious? Did any field surprise you with what it accepted or rejected? Did the public landing look right on the device you used to view it?

### 2. Register and pay as an attendee

Best done with a second browser window or a phone, signed in as a different email.

1. Open the public event landing and pick a **paid** tier (create a paid tier on your event if you only made a Free one).
2. Fill the attendee details and proceed to checkout.
3. On the Stripe checkout page, use this test card:
   - Number: **4242 4242 4242 4242**
   - Expiry: any future date (e.g. 12/30)
   - CVC: any 3 digits (e.g. 123)
   - ZIP: any 5 digits (e.g. 10001)
4. You should land back on Orkora at a confirmation page with your ticket(s).
5. Check the inbox you registered with for **two emails**: a ticket confirmation and a separate payment receipt. They should arrive within a couple of minutes.

What we are watching for: did the price round correctly for your currency (especially XAF / XOF, which have no decimals)? Did the right number of tickets get issued? Did both emails arrive and read sensibly?

### 3. Refund the test order

1. From your organizer dashboard, open the attendee you just registered as.
2. In the orders table, click **Refund** on the paid order.
3. Within a few seconds the row should flip to **REFUNDED**, no page reload needed.

What we are watching for: did it settle on its own, or did you have to click anything else? The expected behaviour is one click, no waiting.

### 4. Live engagement

If your event is published and you have at least one session, the event landing page has a **Live** tab. Open it from the public side.

1. Post a few chat messages.
2. Vote on a poll if you created one.
3. Submit a Q&A question.

What we are watching for: did messages appear instantly for other people in the room? Did poll counts update? Anything feel jittery or laggy?

### 5. Mobile (phone browser)

We do not have a native mobile app yet for testers, but the web app is fully responsive. Open `https://orkora-api.vercel.app` on your phone and run through any of the above. Dashboard tables should swipe sideways on narrow screens; everything else should reflow.

---

## What we already know is rough (please don't report these)

- **Legal pages** at `/legal/terms`, `/legal/privacy`, `/legal/refunds`, `/legal/organizer` ship with a draft banner and have `[FILL IN]` placeholders for the company-specific values. They will be finalised by counsel before public launch.
- **Native mobile app** is in the workspace but not yet built for testers; please use the web app on your phone for now.
- The API service may take 30 to 60 seconds to wake up on the first request of the day (we are on a tier that lets it idle).
- The first time you open a dashboard page after signing in, it can feel a beat slow while data loads.

If something else surprises you, that is fair game. Please report it.

---

## How to report something

One inbox, simple format. Send to: **orkora@terrabande.net**

Use this template (copy-paste, fill in):

```
Subject: [Beta bug] short title

What you tried (in one sentence):
What you expected:
What happened instead:
Where (URL or page name):
Browser + device:
Screenshot or short screen recording, if you have one:
```

Two minutes to write, and it saves us a back-and-forth. If something is broken hard enough that the form felt awkward to fill, just send the screenshot and a sentence; we will figure it out.

---

## Test data and safety

- All payments go through **Stripe test mode**. The only card that works is `4242 4242 4242 4242` (any expiry, any CVC, any ZIP). No real money moves. Don't use a real card; it would fail anyway.
- The email inbox you sign up with is real; OTP codes go there for real. Use an inbox you check.
- Data you create here (events, registrations, refunds) is real beta data that we may keep for product analytics. Avoid using sensitive personal information, real attendee data, or copyrighted images you don't have rights to.
- We will not share what you create with anyone outside the Orkora team.

---

## Thank you

Honestly, testing software that's halfway finished is unglamorous work, and you choosing to spend an hour of your week on Orkora is the reason we will catch the things our own eyes have stopped seeing. We will read every report personally, and we will tell you what we fixed because of you.

If you get stuck or just want to talk through what you saw, email **orkora@terrabande.net** any time.

The Orkora team
