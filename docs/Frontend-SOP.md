# GrasprAI Frontend - SOP: Screens & Functionalities

**Version:** 1.0

**Date:** June 2026

**Audience:** Backend Engineering Team

**Purpose:** Define every screen and functional unit of the GrasprAI frontend, grouped by integration domain, so the backend team can design and deliver the precise endpoints needed for each surface.

**_Important note on current state:_** _The frontend is a fully designed, interaction-complete UI prototype. All data is currently mocked (hardcoded arrays, setTimeout-driven loading states, localStorage flags). No REST, GraphQL, or WebSocket layer exists yet. The sections below describe what every screen_ **_needs_** _from the backend — all payloads, types, and behaviours have already been designed in the UI and are ready to be wired._

## Table of Contents

1.  \[Part 1 — CRUD & Core API Surfaces\](#part-1--crud--core-api-surfaces)
2.  \[Part 2 — Messaging System\](#part-2--messaging-system)
3.  \[Part 3 — LLM / AI Generation Features\](#part-3--llm--ai-generation-features)

# Part 1 - CRUD & Core API Surfaces

_Screens and features that require standard database CRUD operations, user management, scheduling, file management, and OAuth integrations._

## 1.1 Authentication

### 1.1.1 Sign Up (/)

**Screen:** SignupPage → SignupForm

**Description:** New user registration with email/password or Google OAuth.

**UI Interactions:**

*   Full name text input
*   Email text input
*   Password text input (implied by the form)
*   "Create account" primary button
*   "Continue with Google" OAuth button
*   Link to /login

**Required Backend Operations:**

**Operation**

**Method**

**Notes**

Register with email/password

POST /auth/signup

Payload: { fullName, email, password }. Triggers email verification.

OAuth with Google

GET /auth/google

Initiates Google OAuth flow via Supabase.

**Expected Response:**

{

userId: string;

email: string;

requiresEmailVerification: boolean;

}

### 1.1.2 Login (/login)

**Screen:** LoginPage → LoginForm

**Description:** Returning user sign-in.

**UI Interactions:**

*   Email and password inputs
*   "Sign in" button
*   "Continue with Google" button
*   Link to / (signup)

**Required Backend Operations:**

**Operation**

**Method**

**Notes**

Sign in with email

POST /auth/login

Payload: { email, password }

Sign in with Google

GET /auth/google

Same OAuth flow as signup

Password reset request

POST /auth/forgot-password

Payload: { email }

### 1.1.3 Email Verification (/email-verification)

**Screen:** EmailVerificationPage

**Description:** 6-digit OTP code entry after signup. Includes 25-second resend cooldown.

**UI Interactions:**

*   6 individual digit inputs (paste-compatible)
*   "Resend code" button (disabled during cooldown)
*   Back button → /

**Required Backend Operations:**

**Operation**

**Method**

**Notes**

Verify OTP

POST /auth/verify-email

Payload: { code: string } (6-digit string)

Resend OTP

POST /auth/resend-verification

No payload; scoped to authenticated session

**Expected Response on success:**

{ verified: true; redirectTo: "/onboarding" }

## 1.2 Onboarding (/onboarding/\*)

**Screens:** OnboardingStep1 through OnboardingStep5 + OnboardingHomeWalkthroughPage

**Description:** 5-step wizard that captures user preferences on first login. Selections are currently discarded — all must be persisted.

### Step Data Collected

**Step**

**Route**

**Data Captured**

**Type**

1

/onboarding

Primary language

\`"en" \\

2

/onboarding/step-2

Skill area

\`"academic" \\

3

/onboarding/step-3

Learning styles

string\[\] (multi-select)

4

/onboarding/step-4

Study rhythm

\`"daily-light" \\

5

/onboarding/step-5

Invited teammates

string\[\] (emails)

**Required Backend Operations:**

**Operation**

**Method**

**Notes**

Save onboarding preferences

POST /users/me/onboarding

Single call at wizard completion

Send team invites

POST /invites/bulk

Payload: { emails: string\[\] }

Mark onboarding complete

PATCH /users/me

{ onboardingComplete: true }

**Payload:**

{

language: "en" | "fr";

skillArea: "academic" | "professional" | "creative";

learningStyles: string\[\];

studyRhythm: string;

invitedEmails: string\[\];

}

## 1.3 Home Dashboard (/home)

**Screen:** HomePage → HomeDashboard

**Description:** Main application hub. Shows study streak, today's plan, topic progress, and navigation to notebooks. Switches between empty state (new user) and populated dashboard.

### 1.3.1 Streak Card

**Description:** Calendar heatmap showing daily study activity. Week/month toggle.

**Required Data:**

type StudyStreak = {

currentStreak: number; // consecutive days

longestStreak: number;

totalDaysStudied: number;

dailyActivity: {

date: string; // ISO date

minutesStudied: number;

completed: boolean;

}\[\];

};

**Endpoint:** GET /users/me/streak

### 1.3.2 Today's Plan Card

**Description:** List of scheduled study sessions for today, drawn from the calendar.

**Required Data:**

type TodaysPlanItem = {

id: string;

notebookId: string;

notebookTitle: string;

timeLabel: string; // e.g. "9:00 AM – 10:00 AM"

color: string; // hex

activeRecall: boolean;

completed: boolean;

};

**Endpoint:** GET /calendar/today

### 1.3.3 Progress Card + Radar Chart

**Description:** Per-topic understanding percentage. Radar chart with 5–8 axes.

**Required Data:**

type TopicProgress = {

topicId: string;

label: string;

notebookId: string;

understandingPct: number; // 0–100

lastActivityAt: string; // ISO datetime

};

**Endpoint:** GET /users/me/progress

### 1.3.4 Sidebar — Notebook List

**Description:** Tree of notebooks grouped by user-defined folders. Supports pin, rename, delete context menu.

**Required Data:**

type NotebookFolder = {

id: string;

label: string;

notebooks: {

id: string;

title: string;

lastAccessedAt: string;

documentCount: number;

}\[\];

};

**Required Backend Operations:**

**Operation**

**Method**

**Notes**

List notebooks

GET /notebooks

Returns folders + notebooks tree

Create notebook

POST /notebooks

Payload: { title, folderId? }

Rename notebook

PATCH /notebooks/:id

Payload: { title }

Delete notebook

DELETE /notebooks/:id

Soft delete recommended

Pin notebook

PATCH /notebooks/:id/pin

Toggle

### 1.3.5 Focus Timer (Pomodoro)

**Description:** Global timer accessible from the top bar. 20-minute sessions with pause/resume/break. Not persisted currently - but study time **should** be logged.

**Required Backend Operations:**

**Operation**

**Method**

**Notes**

Log study session

POST /study-sessions

Payload: { notebookId?, durationSeconds, completedAt }

### 1.3.6 Global Search

**Description:** Top-bar search across notebooks and documents.

**Required Backend Operations:**

**Operation**

**Method**

**Notes**

Search

GET /search?q=:query

Returns notebooks, documents, notes

**Response:**

type SearchResult = {

notebooks: { id: string; title: string }\[\];

documents: { id: string; name: string; notebookId: string }\[\];

notes: { id: string; excerpt: string; notebookId: string }\[\];

};

### 1.3.7 Notifications

**Description:** Bell icon in top bar shows notification cards. Currently mocked.

**Required Backend Operations:**

**Operation**

**Method**

**Notes**

List notifications

GET /notifications

Paginated

Mark read

PATCH /notifications/:id/read

Mark all read

PATCH /notifications/read-all

## 1.4 Notebook Workspace (/notebook)

### 1.4.1 Create Notebook / Content Starter

**Screen:** NotebookContentStarter

**Description:** Entry point for a new notebook. Users provide a study prompt, then upload documents, paste a link, or record audio.

**UI Interactions:**

*   Free-text prompt: "What are we studying today?"
*   "Upload" button - file picker (PDF, MP3, MP4)
*   "Link" button - URL input modal (YouTube, websites)
*   "Record" button - microphone recording
*   Privacy toggle (Private / Shared)

**Required Backend Operations:**

**Operation**

**Method**

**Notes**

Create notebook

POST /notebooks

Payload: \`{ title, prompt, visibility: "private" \\

Upload document

POST /notebooks/:id/documents

multipart/form-data; file + \`kind: "pdf" \\

Ingest URL

POST /notebooks/:id/documents/url

Payload: { url: string } — scrape or YouTube transcript

Get processing status

GET /notebooks/:id/documents/:docId/status

Polling or webhook for ingestion pipeline

**Document Source Types:**

type DocumentKind = "pdf" | "audio" | "video" | "video-overview" | "recording";

type NotebookDocument = {

id: string;

label: string;

kind: DocumentKind;

extension?: string;

uploadedAt: string;

processingStatus: "pending" | "processing" | "ready" | "failed";

};

### 1.4.2 Notebook Dashboard Tab

**Screen:** NotebookDashboard

**Description:** Per-notebook analytics — topic understanding radar, weak spots, recent activity.

**Required Data:**

**Endpoint**

**Response**

GET /notebooks/:id/stats

{ topics: TopicProgress\[\], weakSpots: string\[\], recentActivity: ActivityItem\[\] }

GET /notebooks/:id/documents

List of all ingested documents

### 1.4.3 Notes Tool

**Screen:** NotebookNotesToolPanel / NotebookNotesToolFlow

**Views:** empty → list → editor → detail

**Description:** Manual note-taking tied to a notebook. CRUD for notes.

**Required Data:**

type NotebookNote = {

id: string;

notebookId: string;

title: string;

body: string; // rich text or markdown

createdAt: string;

updatedAt: string;

sourceDocumentId?: string; // optional source reference

};

**Required Backend Operations:**

**Operation**

**Method**

**Notes**

List notes

GET /notebooks/:id/notes

Create note

POST /notebooks/:id/notes

Payload: { title, body, sourceDocumentId? }

Update note

PATCH /notebooks/:id/notes/:noteId

Payload: { title?, body? }

Delete note

DELETE /notebooks/:id/notes/:noteId

## 1.5 Calendar (/calendar)

**Screen:** CalendarPage → CalendarWeekView / CalendarMobileView

**Description:** Weekly study schedule. Users can view, create, edit, and delete course events. Each event can be linked to a notebook, have an Active Recall flag, include friends, and define a time range.

### 1.5.1 Calendar View

**Description:** Desktop 7-day grid with hour rows + current-time indicator. Mobile: horizontal day strip + event list. Events are color-coded by course.

**Required Data:**

type CalendarEvent = {

id: string;

title: string; // course/session name

date: string; // ISO date

startTime: string; // "HH:mm" 24h

endTime: string; // "HH:mm" 24h

color: {

bar: string; // hex — left accent bar

tint: string; // hex — background

filled: string; // hex — selected state

};

timeLabel: string; // display string e.g. "9:00 AM - 10:00 AM"

notebookId?: string;

activeRecall: boolean;

variant?: "default" | "completed";

participants?: CalendarEventParticipant\[\];

};

type CalendarEventParticipant = {

email: string;

initials?: string;

avatarColor?: string;

isYou?: boolean;

};

**Endpoints:**

**Operation**

**Method**

**Notes**

List events for week

GET /calendar/events?from=:date&to=:date

ISO date range

Get single event

GET /calendar/events/:id

Mark event completed

PATCH /calendar/events/:id

{ variant: "completed" }

### 1.5.2 Add / Edit Course Modal

**Screen:** CalendarAddCourseModal

**Description:** Full-featured scheduling form. Desktop: 2-column (course details + friends). Mobile: 2-step flow.

**Form Fields:**

**Field**

**Type**

**Description**

name

string

Course / session name

color

string (hex)

One of 8 preset colors

from

string ("HH:mm")

Start time

to

string ("HH:mm")

End time

notebook

\`string \\

null\`

activeRecall

boolean

Toggle Active Recall scheduling

includeWeekends

boolean

Recurring schedule includes weekends

startDate

string (ISO date)

First occurrence

friends

Friend\[\]

Invited study partners

**Payload Type:**

type CalendarAddCoursePayload = {

name: string;

color: string; // hex

from: string; // "HH:mm"

to: string; // "HH:mm"

notebookId: string | null;

activeRecall: boolean;

includeWeekends: boolean;

startDate: string; // ISO date

friendIds: string\[\];

};

**Required Backend Operations:**

**Operation**

**Method**

**Notes**

Create event / recurring series

POST /calendar/events

If startDate + recurrence → create series

Update event

PATCH /calendar/events/:id

Edit single occurrence or series

Delete event

DELETE /calendar/events/:id

\`?scope=single\\

### 1.5.3 Google / Outlook Calendar Connect

**Screen:** HomeCalendarAccountModal

**Description:** OAuth connection to external calendar providers for import/sync. Currently mocks with a localStorage flag.

**Required Backend Operations:**

**Operation**

**Method**

**Notes**

Google Calendar OAuth

GET /auth/google-calendar

Initiate OAuth; store token

Outlook OAuth

GET /auth/microsoft-calendar

Initiate OAuth; store token

Get calendar connection status

GET /users/me/calendar-connections

Returns connected providers

Disconnect calendar

DELETE /users/me/calendar-connections/:provider

## 1.6 User Profile (/user-profile)

**Screen:** UserProfilePage

**Description:** Settings hub with 5 sections: General, Notifications, Friends, Billing, Account.

### 1.6.1 General Settings

**Fields:** Full name, email, language preference, color mode (light/auto/dark)

**Required Backend Operations:**

**Operation**

**Method**

**Payload**

Get profile

GET /users/me

—

Update profile

PATCH /users/me

{ fullName?, email?, language?, colorMode? }

Change password

POST /users/me/change-password

{ currentPassword, newPassword }

### 1.6.2 Notification Preferences

**Description:** 7 notification types, each with channel selector (Email & Push / Email only / Push only).

**Notification Types:**

*   New message
*   Quiz War challenge
*   Study reminder
*   Friend join
*   Team invite
*   Weekly summary
*   Product updates

**Required Backend Operations:**

**Operation**

**Method**

**Payload**

Get notification preferences

GET /users/me/notification-preferences

—

Update preferences

PATCH /users/me/notification-preferences

\`{ \[notificationType\]: "email\_push" \\

### 1.6.3 Friends

**Description:** Friend list with avatars, remove friend action. Invite new friends by email.

**Required Backend Operations:**

**Operation**

**Method**

**Notes**

List friends

GET /users/me/friends

Send friend invite

POST /invites

Payload: { email: string }

Remove friend

DELETE /users/me/friends/:friendId

Accept friend request

POST /users/me/friends/:requestId/accept

### 1.6.4 Billing

**Description:** Current plan, payment method editor, invoice history.

**Required Backend Operations:**

**Operation**

**Method**

**Notes**

Get subscription

GET /billing/subscription

Current plan info

Update payment method

PUT /billing/payment-method

Tokenized card data via Stripe

List invoices

GET /billing/invoices

Paginated

Download invoice

GET /billing/invoices/:id/pdf

Cancel subscription

DELETE /billing/subscription

### 1.6.5 Account / Sessions

**Description:** Active session list (device, last seen, location). Delete account option.

**Required Backend Operations:**

**Operation**

**Method**

**Notes**

List sessions

GET /users/me/sessions

Revoke session

DELETE /users/me/sessions/:sessionId

Delete account

DELETE /users/me

Requires re-auth confirmation

# Part 2 - Messaging System

_All screens and features related to direct (P2P) and group messaging between users._

## 2.1 Message Page Overview (/message)

**Screen:** MessagePage

**Description:** Full-featured messaging interface styled similarly to Slack/iMessage. Split layout: thread list (left) + active thread pane (right) on desktop. Mobile: stacked with back navigation.

**Current State:** All threads, messages, and group content are hardcoded. Send appends locally. No real-time delivery. "Luke is typing…" is static.

## 2.2 Thread List

**Screen:** MessageThreadList / MessageMobileThreadList

**Description:** Sorted list of all conversations (P2P and group). Shows avatar(s), name, timestamp, last message preview, pin/mute indicators.

**Required Data:**

type MessageThread = {

id: string;

type: "p2p" | "group";

name: string; // contact name or group name

time: string; // ISO datetime

pinned: boolean;

muted: boolean;

unreadCount: number;

avatars: {

initials: string;

color: string; // hex background

imageSrc?: string; // profile photo URL

}\[\];

preview: string; // last message excerpt

notebookTags?: {

id: string;

label: string;

}\[\];

};

**Required Backend Operations:**

**Operation**

**Method**

**Notes**

List threads

GET /threads

Sorted by updatedAt desc

Search threads

GET /threads?q=:query

Filter by name/message content

Pin thread

PATCH /threads/:id/pin

Toggle

Mute thread

PATCH /threads/:id/mute

Toggle

Delete thread

DELETE /threads/:id

Or archive

Mark thread as read

PATCH /threads/:id/read

## 2.3 P2P Chat Thread

**Screen:** MessageThreadPane (desktop) / MessageMobileP2PChat (mobile)

**Description:** Direct message conversation between two users. Supports text messages. Shows a usage meter (35/50 messages — possibly a free-tier limit).

**Required Data:**

type MessageBubbleData = {

id: string;

threadId: string;

author: string; // display name

authorId: string;

time: string; // ISO datetime

fromYou: boolean;

avatar: {

initials: string;

color: string;

imageSrc?: string;

};

body: string; // message text

};

**Required Backend Operations:**

**Operation**

**Method**

**Notes**

List messages

GET /threads/:id/messages?limit=&cursor=

Paginated, cursor-based

Send message

POST /threads/:id/messages

Payload: { body: string }

Edit message

PATCH /threads/:id/messages/:msgId

Payload: { body: string }

Delete message

DELETE /threads/:id/messages/:msgId

Get thread details

GET /threads/:id

Contact info, notebook tags, mute/pin state

**Real-Time (WebSocket / SSE):**

**Event**

**Direction**

**Payload**

message.new

Server → Client

MessageBubbleData

message.edited

Server → Client

{ id, body }

message.deleted

Server → Client

{ id }

typing.start

Client → Server

{ threadId }

typing.stop

Client → Server

{ threadId }

typing.indicator

Server → Client

{ threadId, userId, name }

thread.read

Server → Client

{ threadId, unreadCount: 0 }

## 2.4 Group Chat Thread

**Screen:** MessageGroupChatContent / MessageMobileGroupChat

**Description:** Group conversations with rich message types: text, file attachments, audio messages, images.

**Message Types:**

type MessageGroupChatContentItem =

| {

id: string;

type: "text";

author: string;

authorId: string;

time: string;

avatar: AvatarData;

text: string;

}

| {

id: string;

type: "file";

author: string;

authorId: string;

time: string;

avatar: AvatarData;

fileName: string;

fileSize: string;

mimeType?: string;

downloadUrl?: string;

}

| {

id: string;

type: "audio";

author: string;

authorId: string;

time: string;

avatar: AvatarData;

durationLabel: string; // e.g. "0:45"

audioUrl?: string;

}

| {

id: string;

type: "image";

author: string;

authorId: string;

time: string;

avatar: AvatarData;

imageSrc: string;

altText?: string;

};

**Required Backend Operations:**

**Operation**

**Method**

**Notes**

Send text

POST /threads/:id/messages

{ type: "text", body: string }

Upload file

POST /threads/:id/messages

multipart/form-data with file

Upload audio

POST /threads/:id/messages

multipart/form-data with audio blob

Upload image

POST /threads/:id/messages

multipart/form-data with image

Download file

GET /threads/:id/messages/:msgId/file

Signed URL response

**Same real-time events as P2P**, extended with message.type field.

## 2.5 Create Group Modal

**Screen:** MessageCreateGroupModal

**Description:** Modal to create a new group thread. User enters a group name and selects members from their friend list.

**Payload:**

type MessageCreateGroupPayload = {

name: string;

memberIds: string\[\]; // friend user IDs

};

**Required Backend Operations:**

**Operation**

**Method**

**Notes**

Create group

POST /threads

Payload: { type: "group", name, memberIds }

Add member

PATCH /threads/:id/members

{ userId }

Remove member

DELETE /threads/:id/members/:userId

Update group name

PATCH /threads/:id

{ name }

Leave group

DELETE /threads/:id/members/me

## 2.6 Contact Info Modal

**Screen:** MessageContactInfoModal / MessageMobileContactInfoModal

**Description:** Sidebar panel showing contact details for a P2P thread (avatar, name, email, shared notebooks).

**Required Data:**

type MessageContactInfo = {

userId: string;

displayName: string;

email: string;

avatarUrl?: string;

sharedNotebooks: { id: string; title: string }\[\];

mutualFriends: number;

friendSince?: string; // ISO date

};

**Endpoint:** GET /users/:userId/contact-info

## 2.7 Group Info Modal

**Screen:** MessageGroupInfoModal

**Description:** Group settings panel showing all members, group name edit, add/remove members.

**Endpoint:** GET /threads/:id/members

## 2.8 Notebook Tags on Threads

**Screen:** MessageNotebookTags

**Description:** Chip row on threads showing linked notebooks. Clicking a chip navigates to the notebook.

**Required Backend Operations:**

**Operation**

**Method**

**Notes**

Get thread notebook tags

GET /threads/:id/notebook-tags

Add notebook tag

POST /threads/:id/notebook-tags

{ notebookId }

Remove notebook tag

DELETE /threads/:id/notebook-tags/:notebookId

## 2.9 Invite Friends (from Sidebar / Profile)

**Screen:** HomeInviteFriendsModal / HomeMobileInviteFriendsModal

**Description:** Send an invite link or direct email invite to new users. Accessible from sidebar footer and messaging screen.

**Required Backend Operations:**

**Operation**

**Method**

**Notes**

Generate invite link

POST /invites/link

Returns { url, expiresAt }

Send email invite

POST /invites

{ email: string }

# Part 3 — LLM / AI Generation Features

_All screens and features that require language model inference, content generation, or AI-graded interactions. Each tool is accessed from the Notebook Documents tab._

**Entry point:** /notebook?title=:name → Documents tab → Tool selector

## 3.1 Chat Tool — Source Chat & Graspr AI

**Screen:** NotebookChatToolPanel

**Route param:** ?chat=source-conversation or ?chat=graspr-conversation

**Description:** Two-mode AI chat panel within a notebook.

*   **Source Chat:** RAG-style Q&A grounded to the notebook's ingested documents.
*   **Graspr AI:** General-purpose AI assistant (not document-grounded).

**Views:**

1.  source-empty — No conversation yet, shows document context indicator
2.  source-conversation — Active chat with document-grounded replies
3.  graspr-empty — General AI landing
4.  graspr-conversation — Active general chat

**Chat Message Type:**

type ChatMessage = {

id: string;

role: "user" | "assistant";

content: string; // markdown supported

createdAt: string;

sourceDocumentIds?: string\[\]; // which docs were cited (source mode only)

citations?: {

documentId: string;

excerpt: string;

pageNumber?: number;

}\[\];

};

**Required Backend Operations:**

**Operation**

**Method**

**Notes**

Send source chat message

POST /notebooks/:id/chat/source

Payload: { message: string, documentIds?: string\[\] }

Send Graspr AI message

POST /chat/general

Payload: { message: string, conversationId?: string }

Get chat history

GET /notebooks/:id/chat/source/history

Paginated

Clear chat history

DELETE /notebooks/:id/chat/source/history

**Streaming:** Both endpoints should support **SSE or chunked streaming** so the UI can render token-by-token. The Content-Type: text/event-stream pattern is preferred.

**Request Payload:**

// Source Chat

{

message: string;

conversationId?: string; // continue existing thread

documentIds?: string\[\]; // filter to specific sources

}

// Graspr AI (General)

{

message: string;

conversationId?: string;

}

**Streaming Response Events:**

data: { type: "token", content: "partial text" }

data: { type: "citations", citations: \[...\] }

data: { type: "done", messageId: "..." }

## 3.2 Quiz Tool

**Screen:** NotebookQuizToolFlow (within NotebookDocumentsTab)

**Route param:** ?quiz=landing, ?quiz=setup, ?quiz=question, etc.

**Description:** Full AI-generated quiz flow. Two sub-modes: standard mastery quiz and multiplayer "Quiz War".

### 3.2.1 Standard Quiz

**Views and flow:**

landing → setup → \[custom\] → loading → question → complete → weak-spots

**Setup Parameters:**

type QuizSetupPayload = {

notebookId: string;

documentIds?: string\[\]; // scope to specific docs

questionCount: number; // 5 / 10 / 20

difficulty: "easy" | "medium" | "hard" | "adaptive";

questionTypes: ("multiple\_choice" | "true\_false" | "short\_answer")\[\];

customTopics?: string\[\]; // optional custom focus

};

**Required Backend Operations:**

**Operation**

**Method**

**Notes**

Generate quiz

POST /notebooks/:id/quiz/generate

Payload: QuizSetupPayload. Async — returns jobId.

Poll quiz status

GET /quiz/jobs/:jobId

\`{ status: "pending" \\

Get quiz

GET /quiz/:quizId

Returns questions

Submit quiz answer

POST /quiz/:quizId/answers

{ questionId, answer: string }

Complete quiz

POST /quiz/:quizId/complete

Returns { score, weakSpots, correctCount, totalCount }

Get weak spots

GET /quiz/:quizId/weak-spots

Topics to review

**Quiz Question Type:**

type QuizQuestion = {

id: string;

quizId: string;

questionNumber: number;

totalQuestions: number;

body: string;

type: "multiple\_choice" | "true\_false" | "short\_answer";

options?: string\[\]; // for multiple\_choice

correctAnswer: string; // revealed after submit

explanation?: string;

sourceDocumentId?: string;

sourcePage?: number;

};

**Quiz Result Type:**

type QuizResult = {

quizId: string;

score: number; // 0–100

correctCount: number;

totalCount: number;

timeTaken: number; // seconds

weakSpots: {

topic: string;

incorrectCount: number;

questionIds: string\[\];

}\[\];

};

### 3.2.2 Quiz War (Multiplayer)

**Views:**

friends → friends-loading → war-question → war-results → war-tapped-out

**Description:** Real-time competitive quiz against friends. Scoreboard updates live during the game. Players can "tap out" early.

**Required Backend Operations:**

**Operation**

**Method**

**Notes**

Create Quiz War room

POST /quiz-war/rooms

{ quizId, friendIds: string\[\] }

Join room

POST /quiz-war/rooms/:roomId/join

Submit answer (real-time)

WebSocket quiz\_war.answer

{ roomId, questionId, answer, answeredAt }

Get leaderboard

WebSocket quiz\_war.scoreboard

Server pushes after each question

Tap out

WebSocket quiz\_war.tap\_out

{ roomId }

**WebSocket Events:**

// Server → Client

{ type: "quiz\_war.question\_start", question: QuizQuestion, timeLimit: 30 }

{ type: "quiz\_war.answer\_reveal", correctAnswer: string, scores: ScoreboardEntry\[\] }

{ type: "quiz\_war.player\_tapped\_out", playerId: string }

{ type: "quiz\_war.game\_over", leaderboard: LeaderboardRow\[\] }

// Client → Server

{ type: "quiz\_war.answer", questionId: string, answer: string }

{ type: "quiz\_war.tap\_out" }

**Scoreboard Entry:**

type QuizWarScoreboardEntry = {

userId: string;

displayName: string;

avatarSrc?: string;

score: number;

streak: number;

answeredCorrectly: boolean;

tappedOut: boolean;

};

## 3.3 Flashcards Tool

**Screen:** NotebookFlashcardsToolFlow / NotebookFlashcardsPanel

**Route param:** ?flashcards=landing, ?flashcards=ai-generate, etc.

**Description:** Flashcard system with manual creation and AI generation. Includes a Spaced Repetition System (SRS) review engine.

**Views:**

landing → \[manual-create | ai-generate → ai-generating → ai-review\] → ai-review-complete

### 3.3.1 AI Generate Flashcards

**Setup Parameters:**

type FlashcardsGeneratePayload = {

notebookId: string;

documentIds?: string\[\];

topics: string\[\]; // selected topic chips

deckName?: string;

cardCount?: number; // 10 / 20 / 50

difficulty: "easy" | "medium" | "hard";

};

**Required Backend Operations:**

**Operation**

**Method**

**Notes**

Generate flashcard deck

POST /notebooks/:id/flashcards/generate

Async — returns jobId

Poll generation status

GET /flashcards/jobs/:jobId

{ status, deckId? }

Get deck

GET /flashcards/decks/:deckId

Returns deck + all cards

### 3.3.2 Manual Create Flashcards

**Required Backend Operations:**

**Operation**

**Method**

**Notes**

Create deck

POST /flashcards/decks

{ notebookId, name }

Add card

POST /flashcards/decks/:deckId/cards

{ front: string, back: string, imageUrl? }

Edit card

PATCH /flashcards/cards/:cardId

{ front?, back?, imageUrl? }

Delete card

DELETE /flashcards/cards/:cardId

### 3.3.3 SRS Review

**Description:** Spaced repetition review. Each card is rated with 4 quality scores after reveal.

**SRS Quality Scores:**

type FlashcardsSrsQuality = "again" | "hard" | "got\_it" | "easy";

**Required Backend Operations:**

**Operation**

**Method**

**Notes**

Start review session

POST /flashcards/decks/:deckId/review

Returns ordered card queue

Submit card rating

POST /flashcards/review/:sessionId/rate

{ cardId, quality: FlashcardsSrsQuality }

Complete session

POST /flashcards/review/:sessionId/complete

Returns session stats

Get next due cards

GET /flashcards/decks/:deckId/due

Cards due for review today

**SRS Card Type:**

type NotebookFlashcardsReviewCard = {

id: string;

deckId: string;

front: string;

back: string;

imageUrl?: string;

dueAt: string; // ISO datetime

intervalDays: number;

easeFactor: number;

repetitions: number;

};

### 3.3.4 Flashcard Reminders

**Screen:** Reminder modal within flashcards tool

**Required Backend Operations:**

**Operation**

**Method**

**Notes**

Set reminder

POST /flashcards/decks/:deckId/reminders

{ time: "HH:mm", days: string\[\], timezone: string }

Update reminder

PATCH /flashcards/decks/:deckId/reminders

Delete reminder

DELETE /flashcards/decks/:deckId/reminders

### 3.3.5 Import Flashcards

**Screen:** Import modal

**Required Backend Operations:**

**Operation**

**Method**

**Notes**

Import Anki deck

POST /flashcards/decks/import/anki

multipart/form-data with .apkg file

Import CSV

POST /flashcards/decks/import/csv

multipart/form-data with .csv (front,back columns)

## 3.4 Summary Tool

**Screen:** NotebookSummaryToolFlow

**Route param:** ?summary=landing → generating → generated

**Description:** AI-generated summary of selected documents. User lands on the tool, clicks "Generate", sees loading state, then reads the summary.

**Views:** landing → generating → generated

**Required Backend Operations:**

**Operation**

**Method**

**Notes**

Generate summary

POST /notebooks/:id/summary

\`{ documentIds?: string\[\], length: "brief" \\

Get summary

GET /notebooks/:id/summary/:summaryId

List summaries

GET /notebooks/:id/summaries

Delete summary

DELETE /notebooks/:id/summaries/:summaryId

**Request Payload:**

{

notebookId: string;

documentIds?: string\[\]; // if empty, summarize all

length: "brief" | "standard" | "detailed";

format: "paragraphs" | "bullet\_points" | "outline";

}

**Response (streaming preferred):**

type NotebookSummary = {

id: string;

notebookId: string;

title: string;

body: string; // markdown

wordCount: number;

generatedAt: string;

sourceDocumentIds: string\[\];

};

## 3.5 Video Lesson Tool

**Screen:** NotebookVideoToolPanel

**Route param:** ?video=form → generating → detail → list

**Description:** AI-generated narrated video lesson from notebook content. User configures language, length, and topic focus. A video with transcript is produced.

**Views:** form → generating → detail (player + transcript) → list

**Configuration Form:**

type VideoGeneratePayload = {

notebookId: string;

documentIds?: string\[\];

language: string; // ISO 639-1, default "en"

length: "short" | "medium" | "long"; // 5-10 / 10-20 / 20-30 min

topics?: string\[\]; // topic chips (multi-select)

title?: string; // optional custom title

};

**Required Backend Operations:**

**Operation**

**Method**

**Notes**

Generate video

POST /notebooks/:id/videos/generate

Async — returns jobId

Poll job status

GET /videos/jobs/:jobId

\`{ status: "pending" \\

Get video

GET /videos/:videoId

Returns video metadata + transcript

List videos

GET /notebooks/:id/videos

Delete video

DELETE /videos/:videoId

**Generated Video Type:**

type GeneratedNotebookVideo = {

id: string;

notebookId: string;

title: string;

description: string;

meta: string; // e.g. "English · 12 min"

posterSrc: string; // thumbnail URL

videoUrl: string; // HLS or MP4 URL

durationTotal: string; // "MM:SS"

transcript: {

speakerLabel: string;

paragraphs: string\[\];

variant: "highlight" | "plain";

timestampStart?: number; // seconds

}\[\];

createdAt: string;

};

## 3.6 Podcast Tool

**Screen:** NotebookPodcastToolPanel

**Route param:** ?podcast=form → generating → detail → detail-transcript → list

**Description:** AI-generated study podcast — a conversational audio between two AI speakers (Alex & Serge) discussing the notebook content.

**Views:** form → generating → detail (player + sections) → detail-transcript (full transcript) → list

**Configuration Form:**

type PodcastGeneratePayload = {

notebookId: string;

documentIds?: string\[\];

language: string; // "en" (extensible)

length: "short" | "medium" | "long"; // 5-10 / 10-20 / 20-30 min

topics?: string\[\]; // multi-select topic chips

title?: string;

};

**Required Backend Operations:**

**Operation**

**Method**

**Notes**

Generate podcast

POST /notebooks/:id/podcasts/generate

Async — returns jobId

Poll job status

GET /podcasts/jobs/:jobId

{ status, podcastId? }

Get podcast

GET /podcasts/:podcastId

Returns metadata + sections + transcript

List podcasts

GET /notebooks/:id/podcasts

Delete podcast

DELETE /podcasts/:podcastId

**Generated Podcast Type:**

type GeneratedNotebookPodcast = {

id: string;

notebookId: string;

title: string;

description: string;

meta: string; // e.g. "English · 15 min"

posterSrc: string; // thumbnail URL

audioUrl: string; // MP3/AAC URL

durationTotal: string; // "MM:SS"

speakers: {

id: string;

name: string;

avatarUrl: string;

}\[\];

sections: {

id: string;

title: string;

body: string;

timeLabel: string; // "00:00 – 01:10"

timestampStart?: number; // seconds

}\[\];

transcript: {

speakerLabel: string;

paragraphs: string\[\];

}\[\];

createdAt: string;

};

## 3.7 Mindmap Tool

**Screen:** NotebookMindmapToolPanel

**Route param:** ?mindmap=landing → custom → generating → viewer → list

**Description:** AI-generated concept mindmap from notebook content. User can select specific topics. Multiple mindmaps per notebook.

**Views:** landing → custom (topic picker) → generating → viewer (image/interactive) → list

**Configuration:**

type MindmapGeneratePayload = {

notebookId: string;

documentIds?: string\[\];

topics?: string\[\]; // optional focus topics

style?: "radial" | "hierarchical" | "tree";

title?: string;

};

**Required Backend Operations:**

**Operation**

**Method**

**Notes**

Generate mindmap

POST /notebooks/:id/mindmaps/generate

Async — returns jobId

Poll job status

GET /mindmaps/jobs/:jobId

{ status, mindmapId? }

Get mindmap

GET /mindmaps/:mindmapId

Returns image URL or structured graph data

List mindmaps

GET /notebooks/:id/mindmaps

Delete mindmap

DELETE /mindmaps/:mindmapId

**Generated Mindmap Type:**

type GeneratedMindmap = {

id: string;

notebookId: string;

title: string;

imageUrl: string; // static PNG/SVG OR

graphData?: { // structured data for interactive rendering

nodes: { id: string; label: string; depth: number }\[\];

edges: { from: string; to: string }\[\];

};

createdAt: string;

topicIds: string\[\];

};

## 3.8 Document Ingestion Pipeline (AI-side)

**Screen:** NotebookLoadingState (shown during ingestion)

**Description:** When a user uploads a PDF, audio, video, or URL, the backend must process and index it before AI tools can use it. The UI shows a loading/processing graphic and polls for status.

**Processing pipeline (expected):**

Upload → Transcription (audio/video) → Chunking → Embedding → Index

**Required Backend Operations:**

**Operation**

**Method**

**Notes**

Get document processing status

GET /notebooks/:id/documents/:docId/status

Delete document

DELETE /notebooks/:id/documents/:docId

Removes from index

Get document preview

GET /notebooks/:id/documents/:docId/preview

Returns PDF viewer URL or transcript

**Processing Status Type:**

type DocumentProcessingStatus = {

documentId: string;

status: "pending" | "transcribing" | "chunking" | "indexing" | "ready" | "failed";

progress?: number; // 0–100

errorMessage?: string;

readyAt?: string; // ISO datetime

};

## Appendix A — URL Query Parameter → Tool State Map

The frontend uses URL query params to drive which tool sub-view is rendered. The backend does not need to manage this, but it is documented for integration testing reference.

**Query Param**

**Route**

**Values**

?title=

/notebook

Notebook name (will migrate to ID)

?tab=

/notebook

\`dashboard \\

?chat=

/notebook

\`source-empty \\

?quiz=

/notebook

\`landing \\

?flashcards=

/notebook

\`landing \\

?summary=

/notebook

\`landing \\

?notes=

/notebook

\`empty \\

?video=

/notebook

\`form \\

?podcast=

/notebook

\`form \\

?mindmap=

/notebook

\`landing \\

## Appendix B — Async Job Pattern

All AI generation endpoints (quiz, flashcards, summary, video, podcast, mindmap) follow an **async job pattern**:

POST /notebooks/:id/:resource/generate

→ 202 Accepted

→ { jobId: string, estimatedSeconds: number }

GET /:resource/jobs/:jobId

→ { status: "pending" | "processing" | "ready" | "failed", resourceId?: string, progress?: number }

GET /:resource/:resourceId

→ Full generated resource

The frontend currently uses setTimeout to simulate this. The polling interval should be **2–5 seconds**. When status === "ready", the frontend navigates to the detail view.

Alternatively, the backend can push job completion via **WebSocket** event: { type: "job.complete", jobId, resourceId }.

## Appendix C — Authentication & Token Strategy

All authenticated endpoints require a **Bearer token** in the Authorization header.

*   **Token source:** Supabase session JWT (already scaffolded in src/lib/supabase/)
*   **Middleware:** middleware.ts refreshes the session on every request via updateSession()
*   **Server components:** Use src/lib/supabase/server.ts cookie-based client
*   **Client components:** Use src/lib/supabase/client.ts browser client

The backend should validate the Supabase JWT and extract sub (user ID) and email from claims.

# Part 4 — Frontend Implementation Guide

_Step-by-step implementation plan for wiring every mocked feature to real backend endpoints. Each section identifies the exact file(s) to modify, the current mock pattern to replace, and the concrete code to introduce._

## 4.0 Global Architecture

### 4.0.1 Environment Variables

Add to .env.local (and all deployment environments):

NEXT\_PUBLIC\_SUPABASE\_URL=https://<project>.supabase.co

NEXT\_PUBLIC\_SUPABASE\_ANON\_KEY=<anon-key>

NEXT\_PUBLIC\_API\_URL=https://api.graspr.ai # backend base URL

NEXT\_PUBLIC\_WS\_URL=wss://api.graspr.ai # WebSocket base URL

### 4.0.2 API Client (src/lib/api/client.ts)

**Create this file.** Central fetch wrapper that attaches the Supabase session token to every request.

import { createClient } from "@/lib/supabase/client";

const BASE\_URL = process.env.NEXT\_PUBLIC\_API\_URL!;

type ApiOptions = RequestInit & {

params?: Record<string, string | number | boolean | undefined>;

};

async function getAuthHeader(): Promise<Record<string, string>> {

const supabase = createClient();

const { data } = await supabase.auth.getSession();

const token = data.session?.access\_token;

return token ? { Authorization: \`Bearer ${token}\` } : {};

}

export async function apiFetch<T>(

path: string,

options: ApiOptions = {},

): Promise<T> {

const { params, headers, ...rest } = options;

const url = new URL(\`${BASE\_URL}${path}\`);

if (params) {

for (const \[key, value\] of Object.entries(params)) {

if (value !== undefined) url.searchParams.set(key, String(value));

}

}

const authHeader = await getAuthHeader();

const response = await fetch(url.toString(), {

...rest,

headers: {

"Content-Type": "application/json",

...authHeader,

...headers,

},

});

if (!response.ok) {

const error = await response.json().catch(() => ({ message: response.statusText }));

throw new ApiError(response.status, error.message ?? "Request failed", error);

}

if (response.status === 204) return undefined as T;

return response.json() as Promise<T>;

}

export class ApiError extends Error {

constructor(

public status: number,

message: string,

public body?: unknown,

) {

super(message);

this.name = "ApiError";

}

}

### 4.0.3 Streaming Helper (src/lib/api/stream.ts)

**Create this file.** Used by all LLM generation endpoints that return SSE.

import { createClient } from "@/lib/supabase/client";

const BASE\_URL = process.env.NEXT\_PUBLIC\_API\_URL!;

export async function apiStream(

path: string,

body: unknown,

onToken: (token: string) => void,

onDone?: (messageId: string) => void,

signal?: AbortSignal,

): Promise<void> {

const supabase = createClient();

const { data } = await supabase.auth.getSession();

const token = data.session?.access\_token;

const response = await fetch(\`${BASE\_URL}${path}\`, {

method: "POST",

headers: {

"Content-Type": "application/json",

...(token ? { Authorization: \`Bearer ${token}\` } : {}),

},

body: JSON.stringify(body),

signal,

});

if (!response.ok || !response.body) throw new Error("Stream failed");

const reader = response.body.getReader();

const decoder = new TextDecoder();

while (true) {

const { done, value } = await reader.read();

if (done) break;

const chunk = decoder.decode(value, { stream: true });

for (const line of chunk.split("\\n")) {

if (!line.startsWith("data:")) continue;

const json = line.slice(5).trim();

if (json === "\[DONE\]") break;

try {

const event = JSON.parse(json) as { type: string; content?: string; messageId?: string };

if (event.type === "token" && event.content) onToken(event.content);

if (event.type === "done" && event.messageId) onDone?.(event.messageId);

} catch {

// malformed chunk — ignore

}

}

}

}

### 4.0.4 WebSocket Manager (src/lib/api/socket.ts)

**Create this file.** Singleton WebSocket used by Messaging and Quiz War.

import { createClient } from "@/lib/supabase/client";

const WS\_URL = process.env.NEXT\_PUBLIC\_WS\_URL!;

type MessageHandler = (event: unknown) => void;

class SocketManager {

private ws: WebSocket | null = null;

private handlers = new Map<string, Set<MessageHandler>>();

private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

async connect(): Promise<void> {

const supabase = createClient();

const { data } = await supabase.auth.getSession();

const token = data.session?.access\_token;

this.ws = new WebSocket(\`${WS\_URL}?token=${token}\`);

this.ws.onmessage = (raw) => {

try {

const event = JSON.parse(raw.data as string) as { type: string };

const handlers = this.handlers.get(event.type);

handlers?.forEach((handler) => handler(event));

} catch { /\* ignore \*/ }

};

this.ws.onclose = () => {

this.reconnectTimer = setTimeout(() => this.connect(), 3000);

};

}

on(type: string, handler: MessageHandler): () => void {

if (!this.handlers.has(type)) this.handlers.set(type, new Set());

this.handlers.get(type)!.add(handler);

return () => this.handlers.get(type)?.delete(handler);

}

send(type: string, payload: unknown): void {

this.ws?.send(JSON.stringify({ type, ...payload as object }));

}

disconnect(): void {

if (this.reconnectTimer) clearTimeout(this.reconnectTimer);

this.ws?.close();

this.ws = null;

}

}

export const socket = new SocketManager();

### 4.0.5 Data Fetching Library

Install **TanStack Query** (React Query v5) as the data-fetching layer:

npm install @tanstack/react-query @tanstack/react-query-devtools

Wrap the app in the root layout (src/app/layout.tsx):

// src/lib/query-client.ts

import { QueryClient } from "@tanstack/react-query";

export const queryClient = new QueryClient({

defaultOptions: {

queries: {

staleTime: 1000 \* 60, // 1 minute

retry: (count, error) => {

if (error instanceof ApiError && error.status < 500) return false;

return count < 2;

},

},

},

});

// src/app/layout.tsx — add QueryClientProvider

import { QueryClientProvider } from "@tanstack/react-query";

import { queryClient } from "@/lib/query-client";

export default function RootLayout({ children }) {

return (

<QueryClientProvider client={queryClient}>

<ColorModeProvider>{children}</ColorModeProvider>

</QueryClientProvider>

);

}

### 4.0.6 Recommended File Structure

src/

├── lib/

│ ├── api/

│ │ ├── client.ts ← fetch wrapper + ApiError

│ │ ├── stream.ts ← SSE streaming helper

│ │ ├── socket.ts ← WebSocket manager

│ │ ├── auth.ts ← auth service functions

│ │ ├── notebooks.ts ← notebook + document service

│ │ ├── calendar.ts ← calendar service

│ │ ├── messaging.ts ← threads + messages service

│ │ ├── ai-tools.ts ← quiz, flashcards, summary, video, podcast, mindmap

│ │ ├── users.ts ← profile + friends + billing service

│ │ └── search.ts ← global search service

│ ├── supabase/ ← existing (keep as-is)

│ ├── color-mode.ts ← existing

│ ├── onboarding.ts ← existing

│ └── query-client.ts ← new

├── hooks/

│ ├── use-auth.ts

│ ├── use-notebooks.ts

│ ├── use-calendar.ts

│ ├── use-messages.ts

│ ├── use-ai-job.ts ← generic async job poller

│ ├── use-stream-chat.ts ← SSE chat hook

│ └── use-socket.ts ← WebSocket event subscription

└── ...

## 4.1 Authentication Implementation

**Files to modify:**

*   src/components/auth/signup-form.tsx
*   src/components/auth/login-form.tsx
*   src/components/auth/email-verification-page.tsx

### Service (src/lib/api/auth.ts)

import { createClient } from "@/lib/supabase/client";

export async function signUpWithEmail(fullName: string, email: string, password: string) {

const supabase = createClient();

const { data, error } = await supabase.auth.signUp({

email,

password,

options: { data: { full\_name: fullName } },

});

if (error) throw error;

return data;

}

export async function signInWithEmail(email: string, password: string) {

const supabase = createClient();

const { data, error } = await supabase.auth.signInWithPassword({ email, password });

if (error) throw error;

return data;

}

export async function signInWithGoogle() {

const supabase = createClient();

const { error } = await supabase.auth.signInWithOAuth({

provider: "google",

options: { redirectTo: \`${window.location.origin}/auth/callback\` },

});

if (error) throw error;

}

export async function verifyOtp(email: string, token: string) {

const supabase = createClient();

const { error } = await supabase.auth.verifyOtp({ email, token, type: "signup" });

if (error) throw error;

}

export async function resendOtp(email: string) {

const supabase = createClient();

const { error } = await supabase.auth.resend({ type: "signup", email });

if (error) throw error;

}

### Component Changes

**\`SignupForm\`** — Replace the router.push("/email-verification") no-op:

// REMOVE: onClick={() => router.push("/email-verification")}

// ADD: controlled form with mutation

import { useState } from "react";

import { signUpWithEmail, signInWithGoogle } from "@/lib/api/auth";

const \[loading, setLoading\] = useState(false);

const \[error, setError\] = useState<string | null>(null);

async function handleSubmit(e: React.FormEvent) {

e.preventDefault();

setLoading(true);

setError(null);

try {

await signUpWithEmail(fullName, email, password);

router.push("/email-verification");

} catch (err) {

setError(err instanceof Error ? err.message : "Sign up failed");

} finally {

setLoading(false);

}

}

**\`EmailVerificationPage\`** — Replace cosmetic resend with real OTP:

// REMOVE: setCodeSent(true) — mock resend

// ADD:

async function handleResend() {

await resendOtp(email); // email from router state or localStorage

setCountdown(25);

setCodeSent(true);

}

async function handleVerify(code: string) {

await verifyOtp(email, code);

router.push("/onboarding");

}

**Create OAuth callback route** (src/app/auth/callback/route.ts):

import { createClient } from "@/lib/supabase/server";

import { NextResponse } from "next/server";

export async function GET(request: Request) {

const { searchParams } = new URL(request.url);

const code = searchParams.get("code");

if (code) {

const supabase = await createClient();

await supabase.auth.exchangeCodeForSession(code);

}

return NextResponse.redirect(new URL("/home", request.url));

}

## 4.2 Onboarding Implementation

**Files to modify:**

*   src/app/onboarding/step-\*/page.tsx (all 5 step pages)
*   src/lib/onboarding.ts

### Service (src/lib/api/users.ts — partial)

import { apiFetch } from "./client";

export type OnboardingPayload = {

language: "en" | "fr";

skillArea: "academic" | "professional" | "creative";

learningStyles: string\[\];

studyRhythm: string;

invitedEmails: string\[\];

};

export async function saveOnboarding(payload: OnboardingPayload): Promise<void> {

await apiFetch("/users/me/onboarding", {

method: "POST",

body: JSON.stringify(payload),

});

}

### Implementation

Accumulate wizard state in a context or URL params across steps. On Step 5 submit:

// src/app/onboarding/step-5/page.tsx — replace router.push("/onboarding/walkthrough")

import { saveOnboarding } from "@/lib/api/users";

async function handleFinish() {

await saveOnboarding({

language: wizardState.language,

skillArea: wizardState.skillArea,

learningStyles: wizardState.learningStyles,

studyRhythm: wizardState.studyRhythm,

invitedEmails: inviteList,

});

clearWalkthroughComplete();

router.push("/onboarding/walkthrough");

}

## 4.3 Home Dashboard Implementation

**Files to modify:**

*   src/components/home/home-sidebar.tsx
*   src/components/walkthrough/home-dashboard/walkthrough-streak-card.tsx
*   src/components/walkthrough/home-dashboard/walkthrough-todays-plan-card.tsx
*   src/components/walkthrough/home-dashboard/walkthrough-your-progress-card.tsx
*   src/components/home/home-top-bar.tsx

### Service (src/lib/api/notebooks.ts)

import { apiFetch } from "./client";

import type { NotebookFolder } from "@/types/notebooks"; // create this types file

export async function listNotebooks(): Promise<NotebookFolder\[\]> {

return apiFetch("/notebooks");

}

export async function createNotebook(title: string, folderId?: string) {

return apiFetch("/notebooks", {

method: "POST",

body: JSON.stringify({ title, folderId }),

});

}

export async function renameNotebook(id: string, title: string) {

return apiFetch(\`/notebooks/${id}\`, {

method: "PATCH",

body: JSON.stringify({ title }),

});

}

export async function deleteNotebook(id: string) {

return apiFetch(\`/notebooks/${id}\`, { method: "DELETE" });

}

export async function pinNotebook(id: string) {

return apiFetch(\`/notebooks/${id}/pin\`, { method: "PATCH" });

}

### Hook (src/hooks/use-notebooks.ts)

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

import { listNotebooks, createNotebook, renameNotebook, deleteNotebook } from "@/lib/api/notebooks";

export function useNotebooks() {

return useQuery({

queryKey: \["notebooks"\],

queryFn: listNotebooks,

});

}

export function useCreateNotebook() {

const qc = useQueryClient();

return useMutation({

mutationFn: ({ title, folderId }: { title: string; folderId?: string }) =>

createNotebook(title, folderId),

onSuccess: () => qc.invalidateQueries({ queryKey: \["notebooks"\] }),

});

}

### Component Changes

**\`HomeSidebar\`** — Replace static NOTEBOOK\_GROUPS tree:

// REMOVE: hardcoded NOTEBOOK\_GROUPS const + static render

// ADD:

const { data: notebookFolders, isLoading } = useNotebooks();

// Render notebookFolders instead of the static array.

// notebookNavHref() will migrate from ?title= to ?id= once notebooks have real IDs.

**Streak Card** — Replace hardcoded props:

// ADD:

const { data: streak } = useQuery({ queryKey: \["streak"\], queryFn: () => apiFetch("/users/me/streak") });

**Today's Plan Card** — Replace static event list:

const { data: todayEvents } = useQuery({ queryKey: \["calendar", "today"\], queryFn: () => apiFetch("/calendar/today") });

**Progress Card + Radar Chart** — Replace hardcoded topic array:

const { data: progress } = useQuery({ queryKey: \["progress"\], queryFn: () => apiFetch("/users/me/progress") });

## 4.4 Notebook Workspace Implementation

**Files to modify:**

*   src/components/notebook/notebook-content-starter.tsx
*   src/components/notebook/notebook-loading-state.tsx
*   src/components/notebook/notebook-documents-tab.tsx (source list)
*   src/app/notebook/page.tsx

### Service additions (src/lib/api/notebooks.ts)

export async function uploadDocument(notebookId: string, file: File, kind: string) {

const form = new FormData();

form.append("file", file);

form.append("kind", kind);

const authHeader = await getAuthHeader(); // re-export from client.ts

const res = await fetch(\`${BASE\_URL}/notebooks/${notebookId}/documents\`, {

method: "POST",

headers: authHeader,

body: form,

});

if (!res.ok) throw new Error("Upload failed");

return res.json();

}

export async function ingestUrl(notebookId: string, url: string) {

return apiFetch(\`/notebooks/${notebookId}/documents/url\`, {

method: "POST",

body: JSON.stringify({ url }),

});

}

export async function getDocumentStatus(notebookId: string, docId: string) {

return apiFetch<DocumentProcessingStatus>(\`/notebooks/${notebookId}/documents/${docId}/status\`);

}

export async function listDocuments(notebookId: string) {

return apiFetch(\`/notebooks/${notebookId}/documents\`);

}

### Hook — Async Job Poller (src/hooks/use-ai-job.ts)

**Reusable across all AI generation tools.**

import { useState, useEffect, useRef } from "react";

import { apiFetch } from "@/lib/api/client";

type JobStatus = "idle" | "pending" | "processing" | "ready" | "failed";

type JobPollResult<T> = {

status: JobStatus;

resourceId: string | null;

resource: T | null;

error: string | null;

start: (jobId: string) => void;

};

export function useAiJob<T>(resourceFetcher: (id: string) => Promise<T>): JobPollResult<T> {

const \[status, setStatus\] = useState<JobStatus>("idle");

const \[resourceId, setResourceId\] = useState<string | null>(null);

const \[resource, setResource\] = useState<T | null>(null);

const \[error, setError\] = useState<string | null>(null);

const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

function start(jobId: string) {

setStatus("pending");

intervalRef.current = setInterval(async () => {

try {

const job = await apiFetch<{ status: string; resourceId?: string }>(\`/jobs/${jobId}\`);

setStatus(job.status as JobStatus);

if (job.status === "ready" && job.resourceId) {

clearInterval(intervalRef.current!);

setResourceId(job.resourceId);

const data = await resourceFetcher(job.resourceId);

setResource(data);

}

if (job.status === "failed") {

clearInterval(intervalRef.current!);

setError("Generation failed. Please try again.");

}

} catch {

clearInterval(intervalRef.current!);

setError("Network error while polling job.");

setStatus("failed");

}

}, 3000);

}

useEffect(() => () => { if (intervalRef.current) clearInterval(intervalRef.current); }, \[\]);

return { status, resourceId, resource, error, start };

}

### Component Changes

**\`NotebookContentStarter\`** — Replace mock loading:

// REMOVE: setLoadingStateOpen(true) → setTimeout → done

// ADD: after notebook creation + file upload:

const { mutateAsync: createNotebook } = useCreateNotebook();

async function handleStart() {

const notebook = await createNotebook({ title: prompt });

if (selectedFile) {

const doc = await uploadDocument(notebook.id, selectedFile, detectKind(selectedFile));

// poll doc status:

pollStatus(notebook.id, doc.id);

}

router.push(\`/notebook?id=${notebook.id}\`);

}

**\`NotebookDocumentsTab\` source bar** — Replace NOTEBOOK\_UPLOADED\_DOCUMENT\_SOURCES:

// REMOVE: import { NOTEBOOK\_UPLOADED\_DOCUMENT\_SOURCES } from "./notebook-documents-tab"

// ADD:

const { data: sources } = useQuery({

queryKey: \["documents", notebookId\],

queryFn: () => listDocuments(notebookId),

enabled: !!notebookId,

});

## 4.5 Notes Tool Implementation

**File to modify:** src/components/notebook/notebook-notes-tool-flow.tsx (and panel files)

### Service (src/lib/api/notebooks.ts — additions)

export async function listNotes(notebookId: string) {

return apiFetch<NotebookNote\[\]>(\`/notebooks/${notebookId}/notes\`);

}

export async function createNote(notebookId: string, title: string, body: string) {

return apiFetch<NotebookNote>(\`/notebooks/${notebookId}/notes\`, {

method: "POST",

body: JSON.stringify({ title, body }),

});

}

export async function updateNote(notebookId: string, noteId: string, patch: { title?: string; body?: string }) {

return apiFetch<NotebookNote>(\`/notebooks/${notebookId}/notes/${noteId}\`, {

method: "PATCH",

body: JSON.stringify(patch),

});

}

export async function deleteNote(notebookId: string, noteId: string) {

return apiFetch(\`/notebooks/${notebookId}/notes/${noteId}\`, { method: "DELETE" });

}

### Component Changes

**\`NotebookNotesToolFlow\`** — Replace local useState<NotebookNote\[\]>(\[\]):

// REMOVE: const \[notes, setNotes\] = useState<NotebookNote\[\]>(\[\])

// ADD:

const { data: notes = \[\], isLoading } = useQuery({

queryKey: \["notes", notebookId\],

queryFn: () => listNotes(notebookId),

});

const { mutateAsync: addNote } = useMutation({

mutationFn: (vars: { title: string; body: string }) => createNote(notebookId, vars.title, vars.body),

onSuccess: () => qc.invalidateQueries({ queryKey: \["notes", notebookId\] }),

});

## 4.6 Calendar Implementation

**Files to modify:**

*   src/components/calendar/calendar-page.tsx
*   src/components/calendar/calendar-week-view.tsx
*   src/components/calendar/calendar-add-course-modal.tsx

### Service (src/lib/api/calendar.ts)

import { apiFetch } from "./client";

import type { CalendarAddCoursePayload } from "@/components/calendar/calendar-add-course-modal";

export async function getWeekEvents(from: string, to: string) {

return apiFetch<CalendarEvent\[\]>("/calendar/events", { params: { from, to } });

}

export async function createEvent(payload: CalendarAddCoursePayload) {

return apiFetch<CalendarEvent>("/calendar/events", {

method: "POST",

body: JSON.stringify(payload),

});

}

export async function updateEvent(id: string, patch: Partial<CalendarAddCoursePayload>) {

return apiFetch<CalendarEvent>(\`/calendar/events/${id}\`, {

method: "PATCH",

body: JSON.stringify(patch),

});

}

export async function deleteEvent(id: string, scope: "single" | "series" = "single") {

return apiFetch(\`/calendar/events/${id}\`, {

method: "DELETE",

params: { scope },

});

}

export async function markEventComplete(id: string) {

return apiFetch(\`/calendar/events/${id}\`, {

method: "PATCH",

body: JSON.stringify({ variant: "completed" }),

});

}

export async function getCalendarConnections() {

return apiFetch<{ provider: string; connected: boolean }\[\]>("/users/me/calendar-connections");

}

### Hook (src/hooks/use-calendar.ts)

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

import { getWeekEvents, createEvent, updateEvent, deleteEvent } from "@/lib/api/calendar";

export function useWeekEvents(from: string, to: string) {

return useQuery({

queryKey: \["calendar", "events", from, to\],

queryFn: () => getWeekEvents(from, to),

});

}

export function useCreateEvent() {

const qc = useQueryClient();

return useMutation({

mutationFn: createEvent,

onSuccess: () => qc.invalidateQueries({ queryKey: \["calendar"\] }),

});

}

### Component Changes

**\`CalendarPage\`** — Replace graspr-calendar-account-connected localStorage flag:

// REMOVE: localStorage.getItem("graspr-calendar-account-connected")

// ADD:

const { data: connections } = useQuery({

queryKey: \["calendar-connections"\],

queryFn: getCalendarConnections,

});

const isConnected = connections?.some((c) => c.connected) ?? false;

// Show modal if !isConnected on first load

**\`CalendarWeekView\`** — Replace MOCK\_SCHEDULED\_EVENTS:

// REMOVE: import { MOBILE\_SCHEDULED\_EVENTS } from "./calendar-mock-data"

// ADD:

const { from, to } = getWeekRange(currentDate); // helper to compute ISO bounds

const { data: events = \[\] } = useWeekEvents(from, to);

**\`CalendarAddCourseModal\` \`onSubmit\`** — Replace onSubmit?.(payload); onClose():

// The modal already calls props.onSubmit(payload) — wire it in the parent:

// In CalendarPage:

const { mutateAsync: createEvent } = useCreateEvent();

<CalendarAddCourseModal

onSubmit={async (payload) => {

await createEvent(payload);

}}

/>

## 4.7 User Profile Implementation

**File to modify:** src/components/user-profile-page.tsx

### Service (src/lib/api/users.ts)

import { apiFetch } from "./client";

export async function getMe() {

return apiFetch<UserProfile>("/users/me");

}

export async function updateMe(patch: Partial<UserProfile>) {

return apiFetch<UserProfile>("/users/me", {

method: "PATCH",

body: JSON.stringify(patch),

});

}

export async function getNotificationPreferences() {

return apiFetch<NotificationPreferences>("/users/me/notification-preferences");

}

export async function updateNotificationPreferences(prefs: NotificationPreferences) {

return apiFetch<NotificationPreferences>("/users/me/notification-preferences", {

method: "PATCH",

body: JSON.stringify(prefs),

});

}

export async function listFriends() {

return apiFetch<Friend\[\]>("/users/me/friends");

}

export async function sendFriendInvite(email: string) {

return apiFetch("/invites", { method: "POST", body: JSON.stringify({ email }) });

}

export async function removeFriend(friendId: string) {

return apiFetch(\`/users/me/friends/${friendId}\`, { method: "DELETE" });

}

export async function getSubscription() {

return apiFetch<Subscription>("/billing/subscription");

}

export async function listInvoices() {

return apiFetch<Invoice\[\]>("/billing/invoices");

}

export async function listSessions() {

return apiFetch<ActiveSession\[\]>("/users/me/sessions");

}

export async function revokeSession(sessionId: string) {

return apiFetch(\`/users/me/sessions/${sessionId}\`, { method: "DELETE" });

}

### Component Changes

**\`UserProfilePage\`** — Replace all const arrays:

// REMOVE: const FRIENDS = \[...\], const INVOICES = \[...\], const SESSIONS = \[...\], etc.

// ADD:

const { data: me } = useQuery({ queryKey: \["me"\], queryFn: getMe });

const { data: friends } = useQuery({ queryKey: \["friends"\], queryFn: listFriends });

const { data: invoices } = useQuery({ queryKey: \["invoices"\], queryFn: listInvoices });

const { data: sessions } = useQuery({ queryKey: \["sessions"\], queryFn: listSessions });

const { data: notifPrefs } = useQuery({ queryKey: \["notif-prefs"\], queryFn: getNotificationPreferences });

const { mutate: updateProfile } = useMutation({

mutationFn: updateMe,

onSuccess: () => qc.invalidateQueries({ queryKey: \["me"\] }),

});

## 4.8 Messaging Implementation

**Files to modify:**

*   src/components/message/message-page.tsx
*   src/components/message/message-thread-pane.tsx
*   src/components/message/message-composer.tsx
*   src/components/message/message-create-group-modal.tsx

### Service (src/lib/api/messaging.ts)

import { apiFetch } from "./client";

export async function listThreads() {

return apiFetch<MessageThread\[\]>("/threads");

}

export async function getMessages(threadId: string, cursor?: string) {

return apiFetch<{ messages: MessageBubbleData\[\]; nextCursor: string | null }>(

\`/threads/${threadId}/messages\`,

{ params: { cursor, limit: 50 } },

);

}

export async function sendMessage(threadId: string, body: string) {

return apiFetch<MessageBubbleData>(\`/threads/${threadId}/messages\`, {

method: "POST",

body: JSON.stringify({ type: "text", body }),

});

}

export async function uploadMessageFile(threadId: string, file: File, type: "file" | "audio" | "image") {

const form = new FormData();

form.append("file", file);

form.append("type", type);

const authHeader = await getAuthHeader();

const res = await fetch(\`${BASE\_URL}/threads/${threadId}/messages\`, {

method: "POST",

headers: authHeader,

body: form,

});

if (!res.ok) throw new Error("Upload failed");

return res.json();

}

export async function createGroup(name: string, memberIds: string\[\]) {

return apiFetch("/threads", {

method: "POST",

body: JSON.stringify({ type: "group", name, memberIds }),

});

}

export async function pinThread(threadId: string) {

return apiFetch(\`/threads/${threadId}/pin\`, { method: "PATCH" });

}

export async function muteThread(threadId: string) {

return apiFetch(\`/threads/${threadId}/mute\`, { method: "PATCH" });

}

export async function markThreadRead(threadId: string) {

return apiFetch(\`/threads/${threadId}/read\`, { method: "PATCH" });

}

### Hook — WebSocket subscriptions (src/hooks/use-socket.ts)

import { useEffect } from "react";

import { socket } from "@/lib/api/socket";

export function useSocketEvent<T>(type: string, handler: (event: T) => void) {

useEffect(() => {

return socket.on(type, handler as (e: unknown) => void);

}, \[type, handler\]);

}

### Hook — Messages with real-time (src/hooks/use-messages.ts)

import { useQuery, useQueryClient } from "@tanstack/react-query";

import { getMessages } from "@/lib/api/messaging";

import { useSocketEvent } from "./use-socket";

export function useMessages(threadId: string) {

const qc = useQueryClient();

// Real-time: append new messages on WS event

useSocketEvent("message.new", (event: { threadId: string; message: MessageBubbleData }) => {

if (event.threadId !== threadId) return;

qc.setQueryData<MessageBubbleData\[\]>(\["messages", threadId\], (prev = \[\]) => \[

...prev,

event.message,

\]);

});

useSocketEvent("typing.indicator", (event: { threadId: string; name: string }) => {

// handle typing state separately

});

return useQuery({

queryKey: \["messages", threadId\],

queryFn: () => getMessages(threadId),

select: (d) => d.messages,

});

}

### Component Changes

**\`MessagePage\`** — Replace PRESET\_THREADS and LUKE\_MESSAGES:

// REMOVE: const PRESET\_THREADS = \[...\], const LUKE\_MESSAGES = \[...\]

// ADD:

const { data: threads = \[\] } = useQuery({ queryKey: \["threads"\], queryFn: listThreads });

const { data: messages = \[\] } = useMessages(selectedThreadId ?? "");

**\`MessageComposer\`** — Replace local append:

// REMOVE: setMessages(prev => \[...prev, newMessage\]) — client-only append

// ADD: call real API, let WS event update state

const { mutateAsync: send } = useMutation({

mutationFn: (body: string) => sendMessage(selectedThreadId, body),

// optimistic update optional

});

async function handleSend() {

await send(draft);

setDraft("");

}

**Typing indicator** — Wire to WebSocket:

// On composer input focus / keypress:

socket.send("typing.start", { threadId: selectedThreadId });

// On blur / send:

socket.send("typing.stop", { threadId: selectedThreadId });

## 4.9 Chat Tool (AI) Implementation

**File to modify:** src/components/notebook/notebook-chat-tool-panel.tsx

### Service (src/lib/api/ai-tools.ts — partial)

import { apiStream } from "../stream";

export async function streamSourceChat(

notebookId: string,

message: string,

conversationId: string | undefined,

onToken: (token: string) => void,

onDone: (msgId: string) => void,

signal?: AbortSignal,

) {

return apiStream(

\`/notebooks/${notebookId}/chat/source\`,

{ message, conversationId },

onToken,

onDone,

signal,

);

}

export async function streamGrasprChat(

message: string,

conversationId: string | undefined,

onToken: (token: string) => void,

onDone: (msgId: string) => void,

signal?: AbortSignal,

) {

return apiStream(

\`/chat/general\`,

{ message, conversationId },

onToken,

onDone,

signal,

);

}

### Hook (src/hooks/use-stream-chat.ts)

import { useState, useRef, useCallback } from "react";

import type { ChatMessage } from "@/types/chat";

type StreamChatOptions = {

onStream: (message: string, conversationId: string | undefined,

onToken: (t: string) => void, onDone: (id: string) => void, signal?: AbortSignal) => Promise<void>;

};

export function useStreamChat({ onStream }: StreamChatOptions) {

const \[messages, setMessages\] = useState<ChatMessage\[\]>(\[\]);

const \[streaming, setStreaming\] = useState(false);

const \[conversationId, setConversationId\] = useState<string | undefined>();

const abortRef = useRef<AbortController | null>(null);

const send = useCallback(async (text: string) => {

const userMsg: ChatMessage = { id: crypto.randomUUID(), role: "user", content: text, createdAt: new Date().toISOString() };

const assistantMsg: ChatMessage = { id: crypto.randomUUID(), role: "assistant", content: "", createdAt: new Date().toISOString() };

setMessages((prev) => \[...prev, userMsg, assistantMsg\]);

setStreaming(true);

abortRef.current = new AbortController();

await onStream(

text,

conversationId,

(token) => {

setMessages((prev) =>

prev.map((m) => m.id === assistantMsg.id ? { ...m, content: m.content + token } : m),

);

},

(msgId) => {

setMessages((prev) =>

prev.map((m) => m.id === assistantMsg.id ? { ...m, id: msgId } : m),

);

setConversationId(msgId); // use returned ID as conversation anchor

setStreaming(false);

},

abortRef.current.signal,

);

}, \[conversationId, onStream\]);

return { messages, streaming, send };

}

### Component Changes

**\`NotebookChatToolPanel\`** — Replace DEMO\_ASSISTANT\_REPLY timeout:

// REMOVE: setTimeout(() => setMessages(prev => \[...prev, DEMO\_ASSISTANT\_REPLY\]), 800)

// ADD (source mode):

const { messages: sourceMessages, streaming, send } = useStreamChat({

onStream: (msg, convId, onToken, onDone, signal) =>

streamSourceChat(notebookId, msg, convId, onToken, onDone, signal),

});

// ADD (Graspr AI mode):

const { messages: grasprMessages, streaming: grasprStreaming, send: sendGraspr } = useStreamChat({

onStream: (msg, convId, onToken, onDone, signal) =>

streamGrasprChat(msg, convId, onToken, onDone, signal),

});

## 4.10 Quiz Tool Implementation

**File to modify:** src/components/notebook/notebook-documents-tab.tsx (quiz flow section) and src/components/notebook/notebook-quiz-war.tsx

### Service (src/lib/api/ai-tools.ts — additions)

export async function generateQuiz(notebookId: string, payload: QuizSetupPayload) {

return apiFetch<{ jobId: string; estimatedSeconds: number }>(

\`/notebooks/${notebookId}/quiz/generate\`,

{ method: "POST", body: JSON.stringify(payload) },

);

}

export async function getQuiz(quizId: string) {

return apiFetch<{ questions: QuizQuestion\[\] }>(\`/quiz/${quizId}\`);

}

export async function submitAnswer(quizId: string, questionId: string, answer: string) {

return apiFetch(\`/quiz/${quizId}/answers\`, {

method: "POST",

body: JSON.stringify({ questionId, answer }),

});

}

export async function completeQuiz(quizId: string) {

return apiFetch<QuizResult>(\`/quiz/${quizId}/complete\`, { method: "POST" });

}

// Quiz War

export async function createQuizWarRoom(quizId: string, friendIds: string\[\]) {

return apiFetch<{ roomId: string }>("/quiz-war/rooms", {

method: "POST",

body: JSON.stringify({ quizId, friendIds }),

});

}

### Component Changes

**Quiz setup submit** — Replace setTimeout loading mock:

// REMOVE: setTimeout(() => setQuizToolView("question"), 1200)

// ADD:

const job = await generateQuiz(notebookId, setupPayload);

const { start } = useAiJob(getQuiz); // polls until ready

start(job.jobId);

// When job.status === "ready":

setQuiz(job.resource);

setQuizToolView("question");

**Per-question answer** — Replace static reveal:

// REMOVE: setAnswerRevealed(true) — static

// ADD:

const result = await submitAnswer(activeQuizId, question.id, selectedAnswer);

setCorrect(result.isCorrect);

setCorrectAnswer(result.correctAnswer);

setAnswerRevealed(true);

**Quiz War** — Replace static scoreboard with WebSocket events:

// After creating room:

socket.send("quiz\_war.join", { roomId });

useSocketEvent("quiz\_war.question\_start", (event) => {

setCurrentQuestion(event.question);

setTimeLimit(event.timeLimit);

setQuizToolView("war-question");

});

useSocketEvent("quiz\_war.answer\_reveal", (event) => {

setScoreboard(event.scores);

});

useSocketEvent("quiz\_war.game\_over", (event) => {

setLeaderboard(event.leaderboard);

setQuizToolView("war-results");

});

// On answer submit:

socket.send("quiz\_war.answer", { questionId: currentQuestion.id, answer: selectedAnswer });

## 4.11 Flashcards Tool Implementation

**Files to modify:**

*   src/components/notebook/notebook-flashcards-ai-generate-panel.tsx
*   src/components/notebook/notebook-flashcards-review-panel.tsx
*   src/components/notebook/notebook-flashcards-manual-create.tsx

### Service (src/lib/api/ai-tools.ts — additions)

export async function generateFlashcards(notebookId: string, payload: FlashcardsGeneratePayload) {

return apiFetch<{ jobId: string }>(\`/notebooks/${notebookId}/flashcards/generate\`, {

method: "POST", body: JSON.stringify(payload),

});

}

export async function getDeck(deckId: string) {

return apiFetch<FlashcardDeck>(\`/flashcards/decks/${deckId}\`);

}

export async function listDecks(notebookId: string) {

return apiFetch<FlashcardDeck\[\]>(\`/notebooks/${notebookId}/flashcards/decks\`);

}

export async function startReview(deckId: string) {

return apiFetch<{ sessionId: string; cards: NotebookFlashcardsReviewCard\[\] }>(

\`/flashcards/decks/${deckId}/review\`, { method: "POST" },

);

}

export async function rateCard(sessionId: string, cardId: string, quality: FlashcardsSrsQuality) {

return apiFetch(\`/flashcards/review/${sessionId}/rate\`, {

method: "POST", body: JSON.stringify({ cardId, quality }),

});

}

export async function completeReview(sessionId: string) {

return apiFetch(\`/flashcards/review/${sessionId}/complete\`, { method: "POST" });

}

### Component Changes

**AI Generate Panel** — Replace setTimeout deck mock:

// REMOVE: setTimeout(() => setFlashcardsToolView("ai-review"), 1200)

// ADD:

const job = await generateFlashcards(notebookId, { topics, documentIds, cardCount, difficulty });

const { start, status, resource } = useAiJob(getDeck);

start(job.jobId);

// When status === "ready": setActiveDeck(resource); setFlashcardsToolView("ai-review")

**Review Panel** — Replace static card queue + quality buttons:

// REMOVE: local cards array, static quality rating that does nothing

// ADD: on mount

const session = await startReview(activeDeck.id);

setCards(session.cards);

setSessionId(session.sessionId);

// On quality button click:

await rateCard(sessionId, currentCard.id, quality);

advanceCard();

## 4.12 Summary Tool Implementation

**File to modify:** src/components/notebook/notebook-summary-tool-flow.tsx

### Service

export async function generateSummary(notebookId: string, payload: { documentIds?: string\[\]; length: string; format: string }) {

return apiFetch<{ jobId: string }>(\`/notebooks/${notebookId}/summary\`, {

method: "POST", body: JSON.stringify(payload),

});

}

export async function getSummary(summaryId: string) {

return apiFetch<NotebookSummary>(\`/notebooks/summaries/${summaryId}\`);

}

### Component Changes

// REMOVE: setTimeout(() => setSummaryToolView("generated"), 1500)

// ADD:

const job = await generateSummary(notebookId, { length: "standard", format: "paragraphs" });

const { start, status, resource } = useAiJob(getSummary);

start(job.jobId);

// When status === "ready": setActiveSummary(resource); setSummaryToolView("generated")

## 4.13 Video Tool Implementation

**File to modify:** src/components/notebook/notebook-video-tool-panel.tsx

### Service

export async function generateVideo(notebookId: string, payload: VideoGeneratePayload) {

return apiFetch<{ jobId: string }>(\`/notebooks/${notebookId}/videos/generate\`, {

method: "POST", body: JSON.stringify(payload),

});

}

export async function getVideo(videoId: string) {

return apiFetch<GeneratedNotebookVideo>(\`/videos/${videoId}\`);

}

export async function listVideos(notebookId: string) {

return apiFetch<GeneratedNotebookVideo\[\]>(\`/notebooks/${notebookId}/videos\`);

}

### Component Changes

// REMOVE: setTimeout(() => setVideoToolView("detail"), 1500), DEFAULT\_VIDEO\_TRANSCRIPT static data

// ADD:

const job = await generateVideo(notebookId, { language, length, topics });

const { start, status, resource } = useAiJob(getVideo);

start(job.jobId);

// When status === "ready": setActiveVideo(resource); setVideoToolView("detail")

// List view:

const { data: videos = \[\] } = useQuery({

queryKey: \["videos", notebookId\],

queryFn: () => listVideos(notebookId),

});

## 4.14 Podcast Tool Implementation

**File to modify:** src/components/notebook/notebook-podcast-tool-panel.tsx

### Service

export async function generatePodcast(notebookId: string, payload: PodcastGeneratePayload) {

return apiFetch<{ jobId: string }>(\`/notebooks/${notebookId}/podcasts/generate\`, {

method: "POST", body: JSON.stringify(payload),

});

}

export async function getPodcast(podcastId: string) {

return apiFetch<GeneratedNotebookPodcast>(\`/podcasts/${podcastId}\`);

}

export async function listPodcasts(notebookId: string) {

return apiFetch<GeneratedNotebookPodcast\[\]>(\`/notebooks/${notebookId}/podcasts\`);

}

### Component Changes

// REMOVE: setTimeout(() => setPodcastToolView("detail"), 1500), DEMO\_PODCAST\_SECTIONS, DEMO\_SPEAKERS

// ADD:

const job = await generatePodcast(notebookId, { language, length, topics });

const { start, status, resource } = useAiJob(getPodcast);

start(job.jobId);

// When status === "ready": setActivePodcast(resource); setPodcastToolView("detail")

## 4.15 Mindmap Tool Implementation

**File to modify:** src/components/notebook/notebook-mindmap-tool-panel.tsx

### Service

export async function generateMindmap(notebookId: string, payload: MindmapGeneratePayload) {

return apiFetch<{ jobId: string }>(\`/notebooks/${notebookId}/mindmaps/generate\`, {

method: "POST", body: JSON.stringify(payload),

});

}

export async function getMindmap(mindmapId: string) {

return apiFetch<GeneratedMindmap>(\`/mindmaps/${mindmapId}\`);

}

export async function listMindmaps(notebookId: string) {

return apiFetch<GeneratedMindmap\[\]>(\`/notebooks/${notebookId}/mindmaps\`);

}

### Component Changes

// REMOVE: const \[mindmaps, setMindmaps\] = useState<GeneratedMindmap\[\]>(\[...staticData\])

// REMOVE: setTimeout on generate

// ADD:

const { data: mindmaps = \[\] } = useQuery({

queryKey: \["mindmaps", notebookId\],

queryFn: () => listMindmaps(notebookId),

});

// On generate:

const job = await generateMindmap(notebookId, { topics: topicIds });

const { start, status, resource } = useAiJob(getMindmap);

start(job.jobId);

// When status === "ready": setActiveMindmapId(resource.id); setMindmapToolView("viewer")

## 4.16 Notebook ID Migration

Currently, the frontend identifies notebooks by title via ?title=Brain in the URL. When the backend is live, this **must migrate to \`?id=<uuid>\`**.

**Files to update:**

**File**

**Change**

src/app/notebook/page.tsx

Accept id query param instead of title

src/components/home/home-sidebar-nav.ts

Update notebookNavHref() to use id

src/components/home/home-sidebar.tsx

Pass notebook.id instead of notebook.title

src/components/notebook/notebook-page.tsx

Accept notebookId prop instead of notebookTitle

All tool panels

Use notebookId for all API calls

// src/components/home/home-sidebar-nav.ts

// BEFORE:

export function notebookNavHref(title: string) {

return \`/notebook?title=${encodeURIComponent(title)}\`;

}

// AFTER:

export function notebookNavHref(id: string, title: string) {

return \`/notebook?id=${id}&title=${encodeURIComponent(title)}\`;

}

## 4.17 Route Protection

Currently middleware.ts refreshes the session but does not redirect unauthenticated users. Add route protection:

**File to modify:** middleware.ts

import { updateSession } from "@/lib/supabase/middleware";

import { createServerClient } from "@supabase/ssr";

import { NextResponse, type NextRequest } from "next/server";

const PUBLIC\_ROUTES = \["/", "/login", "/email-verification", "/auth/callback"\];

export async function middleware(request: NextRequest) {

const response = await updateSession(request);

const { pathname } = request.nextUrl;

const isPublic = PUBLIC\_ROUTES.some((r) => pathname.startsWith(r));

if (!isPublic) {

const supabase = createServerClient(

process.env.NEXT\_PUBLIC\_SUPABASE\_URL!,

process.env.NEXT\_PUBLIC\_SUPABASE\_ANON\_KEY!,

{ cookies: { getAll: () => request.cookies.getAll() } },

);

const { data: { user } } = await supabase.auth.getUser();

if (!user) {

return NextResponse.redirect(new URL("/login", request.url));

}

}

return response;

}

export const config = {

matcher: \["/((?!\_next/static|\_next/image|favicon.ico|assets).\*)"\],

};

## Appendix D — Implementation Priority Order

Suggested integration sequence to unblock the most UI surface area first:

**Priority**

**Feature**

**Rationale**

1

Auth (signup/login/OTP)

Gates everything

2

Route protection middleware

Prevents unauthenticated access

3

Notebook CRUD + document upload

Core product loop

4

Document ingestion status polling

Required before AI tools work

5

Notes tool

Simplest AI-adjacent tool, pure CRUD

6

Calendar events

Independent feature, high visibility

7

Source Chat (streaming)

First LLM integration, validates SSE pattern

8

Summary tool

Async job pattern — template for rest

9

Flashcards (AI generate + SRS)

Complex but self-contained

10

Quiz tool (standard)

Async job + multi-step flow

11

Video & Podcast tools

Async job pattern — same as summary

12

Mindmap tool

Async job pattern — same as summary

13

Messaging (REST)

Thread + message CRUD

14

Messaging (WebSocket)

Real-time layer on top of REST

15

Quiz War (WebSocket)

Real-time multiplayer

16

User profile / billing

Can use mock data in early sprints

17

Home dashboard analytics

Depends on study session data accumulating

_Document generated from frontend codebase analysis — GrasprAI Frontend v0.1 (prototype)_