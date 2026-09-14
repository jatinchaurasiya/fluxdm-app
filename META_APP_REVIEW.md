# Meta App Review & Official API Approval: Complete Submission Package

This guide contains everything required to pass Meta App Review and move **FluxDM** from Development Mode to **Live Mode (Official Public API)** with 100% approval.

---

## 📋 Phase 1: Meta Developer Dashboard Pre-Flight Checklist

Before submitting for review, ensure these prerequisites are filled in your **Meta Developers Console** (`https://developers.facebook.com/apps/YOUR_APP_ID/settings/basic/`):

1. **App Icon:**
   - Upload a 1024x1024 px clean app logo (PNG/JPG, transparent or solid dark background).
2. **App Details:**
   - **Privacy Policy URL:** Publicly accessible HTTPS URL explaining how user data and Instagram tokens are handled (must state that tokens are stored locally on the user's desktop machine and not sold to 3rd parties).
   - **Terms of Service URL:** Public HTTPS URL.
   - **User Data Deletion Instructions URL:** URL or email instructions (e.g., `https://yourdomain.com/data-deletion` or stating users can disconnect their account in the app settings to wipe local tokens).
   - **Category:** `Business and Pages` or `Productivity`.
3. **Business Verification:**
   - Under **App Review > Verification**, complete Business Verification using a registered company document (GST, Certificate of Incorporation, or Business utility bill). Meta requires business verification for messaging and publishing permissions.
4. **Data Protection Assessment (DPA) / Data Use Checkup:**
   - Complete the annual compliance questionnaire under **App Review > Data Use Checkup**.

---

## 📝 Phase 2: Copy-Paste Permission Justification Scripts

When submitting permissions under **App Review > Permissions and Features**, Meta requires you to answer:
1. *How does your app use this permission?*
2. *Demonstrate how this permission is used in your screencast.*

Use the exact copy-paste text below for each permission:

---

### 1. `instagram_business_basic` (or `instagram_basic`)

> **How is your app using this permission?**
>
> FluxDM is a desktop workflow automation and content management platform for Instagram creators and businesses.
> Our application uses `instagram_business_basic` to retrieve the authenticated creator's profile information, specifically:
> - Instagram Username (`@username`)
> - Profile Picture URL
> - Instagram Professional Business Account ID (`id`)
>
> This data is used solely within the desktop application interface to identify the currently active account, display the user profile in the navigation bar, and confirm the creator's identity across their scheduled posts and automation flows. We do not transfer, resell, or aggregate this profile data.
>
> **Where in the screencast does this appear?**
> - Timestamp: 0:00 - 0:40 (During account connection via Instagram OAuth and top navigation bar display).

---

### 2. `instagram_business_manage_messages` (or `instagram_manage_messages`)

> **How is your app using this permission?**
>
> FluxDM automates customer engagement and lead fulfillment directly through Instagram Direct Messages. 
> Our application uses `instagram_business_manage_messages` to:
> 1. Send automated Direct Messages and rich interactive button payloads to users who request resources, lead magnets, links, or discounts in response to creator content.
> 2. Check follower verification status (`is_user_follow_business`) before delivering exclusive rewards or links.
> 3. Process user interactive quick replies and button clicks within direct messaging threads to provide relevant automated responses.
>
> This enables businesses to provide instant 24/7 customer support, deliver requested links without manual delay, and foster community engagement in strict compliance with Instagram's standard messaging policies.
>
> **Where in the screencast does this appear?**
> - Timestamp: 1:30 - 2:45 (Demonstrating automated welcome DM delivery, interactive button clicking, and follower-gated link distribution).

---

### 3. `instagram_business_manage_comments` (or `instagram_manage_comments`)

> **How is your app using this permission?**
>
> FluxDM monitors engagement on creator Reels and posts to automatically trigger personalized conversational flows.
> Our application uses `instagram_business_manage_comments` to:
> 1. Poll and monitor public comments on the creator's published Instagram media to detect designated automation keywords (e.g., "GUIDE", "LINK", "INFO").
> 2. Publish public replies to comments acknowledging the user's request (e.g., "Check your DMs! 🚀").
> 3. Send direct Private Replies to user comments to initiate a one-on-one direct message conversation with requested payloads.
>
> This streamlines comment moderation, improves audience response times, and prevents lost business inquiries.
>
> **Where in the screencast does this appear?**
> - Timestamp: 1:10 - 2:00 (Showing a comment on a Reel triggering the automated private reply and DM flow).

---

### 4. `instagram_business_content_publish` (or `instagram_content_publish`)

> **How is your app using this permission?**
>
> FluxDM includes a Post & Reel Scheduler that allows creators to organize and automate their content calendar.
> Our application uses `instagram_business_content_publish` to:
> 1. Create media containers on the creator's Instagram Professional account via the Graph API (`/me/media` with `REELS` or `IMAGE`).
> 2. Poll container transcoding status until encoding is complete (`status_code: 'FINISHED'`).
> 3. Publish the media container live to the creator's Instagram feed (`/me/media_publish`) at the scheduled date and time chosen by the creator.
> 4. Retrieve the live Instagram permalink (`https://www.instagram.com/reel/...`) so the creator can monitor the published post within the app.
>
> Content is published strictly upon explicit user initiation or their configured scheduler calendar. We do not publish any unsolicited or unapproved content.
>
> **Where in the screencast does this appear?**
> - Timestamp: 2:45 - 3:50 (Demonstrating Reel scheduling, video upload, status polling, and live publication with Instagram permalink verification).

---

## 🎬 Phase 3: Screencast Walkthrough Recording Script

Meta App Reviewers **require a 2 to 4 minute screencast video** showing how the app works in real time.

### Video Requirements:
- **Format:** MP4 or MOV.
- **Resolution:** 1080p (Full screen recording of your desktop showing FluxDM).
- **Audio/Captions:** English voiceover or clear text annotations explaining each step.
- **Length:** 2 to 4 minutes.

### Step-by-Step Recording Script:

| Step | Time | What to Show on Screen | What to Say / Caption |
| :--- | :--- | :--- | :--- |
| **1. Intro & App Login** | `0:00 - 0:35` | Open FluxDM desktop app. Click **Connect Instagram Account**. Show the browser opening Meta's official OAuth consent screen with your App Name and Permissions requested. Authorize the account. | *"Welcome to FluxDM. Here we demonstrate our app connecting via Instagram Login for Business. The user clicks Connect Account, views the requested permissions on Meta's official OAuth dialog, and grants access."* |
| **2. Profile & Basic Data** | `0:35 - 1:00` | Redirect back to FluxDM. Show the app populating `@project.oneeighty` username, profile picture, and account status in the top bar. | *"Using `instagram_business_basic`, FluxDM retrieves the authenticated username and avatar to display the active workspace for the creator."* |
| **3. Automation Flow Setup** | `1:00 - 1:40` | Navigate to **Automation Wizard**. Show setting a trigger keyword (e.g., `PROMO`), the public comment reply, and the DM payload with buttons. | *"Using `instagram_business_manage_comments`, the creator configures an automation rule that detects keyword comments on their posts."* |
| **4. Comment & DM in Action** | `1:40 - 2:35` | In a browser window next to the app, open Instagram. Leave a comment `"PROMO"` on a Reel. Show FluxDM polling the comment, posting a public reply, and sending the DM with the interactive button. Show the user receiving the DM on Instagram. | *"Here we demonstrate `instagram_business_manage_comments` and `instagram_business_manage_messages`. The user comments 'PROMO', our app detects it, sends an immediate private reply, and delivers the requested link in Instagram Direct."* |
| **5. Reel Scheduler & Publish** | `2:35 - 3:45` | Navigate to **Scheduler** in FluxDM. Select a video, write a caption, and click **Publish Now (Test)**. Show the live status transition (`PROCESSING` -> `PUBLISHED`). Click **View Live** to open the published Reel on Instagram. | *"Using `instagram_business_content_publish`, the user schedules or publishes a Reel. FluxDM transmits the media container to Meta's API, monitors transcoding, and publishes it live to the creator's feed, generating the live Instagram permalink."* |
| **6. Conclusion** | `3:45 - 4:00` | Show the user disconnecting or managing their account in settings. | *"Users can disconnect their account at any time, instantly revoking and clearing all stored tokens locally. Thank you for reviewing FluxDM."* |

---

## 🔑 Phase 4: Reviewer Testing Instructions (Copy-Paste)

In the **"Notes / Instructions for Reviewer"** text box, paste:

```text
Hello Meta Review Team,

Thank you for reviewing FluxDM!

FluxDM is an Electron-based desktop productivity application built for Instagram Creators and Businesses to schedule Reels and automate customer service messaging workflows.

To test FluxDM:
1. Video Walkthrough:
   Please refer to our attached high-definition screencast demonstrating all requested permissions in real-time.
2. Direct Test Account:
   - Instagram Handle: @project.oneeighty (already added as a Test User / Tester under App Roles).
   - Test Media URL: Verified live Reel published by our app at: https://www.instagram.com/reel/DdOUajjE1P6/
3. Permissions Demonstrated:
   - instagram_business_basic: Account profile display and verification.
   - instagram_business_manage_comments: Comment detection and automated replies.
   - instagram_business_manage_messages: Direct Message delivery and interactive button payload handling.
   - instagram_business_content_publish: End-to-end Reel creation and publishing to feed.

All tokens and credentials are securely isolated on the desktop client. If you require any additional information or a live demonstration, please contact us immediately.

Best regards,
FluxDM Team
```

---

## 🚀 Phase 5: After Approval (Going to Live Mode)

Once Meta approves your review submission (typically 2 to 5 business days):
1. Go to **Meta App Dashboard > App Mode: Development** in the top header.
2. Toggle the switch to **Live**.
3. Now, **any Instagram creator or business in the world** can log in to FluxDM without having to be manually added as a Tester!
