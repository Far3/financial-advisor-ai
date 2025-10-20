# AI Financial Advisor Assistant

An AI-powered assistant that manages emails, contacts, and calendar scheduling automatically.

## Features

✅ **Smart Email Management**
- Search emails by content, sender, or topic
- Send emails via Gmail integration

✅ **Contact Management (HubSpot)**
- Create and manage contacts
- Add notes to contacts
- Search contact history

✅ **Intelligent Calendar Scheduling**
- View upcoming meetings
- Find available time slots
- Schedule meetings automatically
- Monitors email replies and books meetings

✅ **Autonomous Task Management**
- AI monitors email replies
- Automatically schedules meetings when contacts respond
- Sends confirmations

## Tech Stack

- **Frontend:** Next.js 14, TypeScript, Tailwind CSS
- **Backend:** Next.js API Routes
- **Database:** Supabase (PostgreSQL)
- **AI:** OpenAI GPT-4
- **Integrations:** Gmail API, Google Calendar API, HubSpot API
- **Vector Search:** pgvector for semantic email search

## Setup


```npm install```

```Set up environment variables (see .env.example)```

Run development server: ```npm run dev```

### Example Commmands

### Email Commands
- "What's on my calendar this week?"
- "Show me emails from Sara"
- "Find any emails about 'investment strategy'"
- "Send an email to john@example.com about our Q4 project update"
- "Email Sara asking about the budget proposal"
- "Who emailed me about retirement planning?"

### Calendar Commands
- "What's on my calendar this week?"
- "Do I have any meetings tomorrow?"
- "Show me my schedule for next Monday"
- "Find me available time slots next week"
- "Create a calendar event for tomorrow at 2pm titled 'Team Standup'"
- "Block off 3pm-4pm on Friday for client review"

### Contact & CRM Commands
- "Who is Sara Smith?"
- "Create a new contact for jane@example.com"
- "Add a note to Sara's contact about premium service interest"
- "Show me all contacts interested in retirement planning"
- "Find contacts who mentioned their kids"

### Smart Scheduling Commands
- "Schedule a meeting with Sara Smith"
- "Set up a call with John next week"
- "Book time with frank@client.com to discuss portfolio"
- "Arrange a meeting with the Johnson family"

*Note: The AI will automatically check your calendar, propose times, send the email, and schedule the meeting when they respond!*

### Search & Analysis Commands
- "Who mentioned baseball in their emails?"
- "Find clients interested in tax planning"
- "Show me recent conversations about college funds"
- "Which clients haven't been contacted in 30 days?"
- "Summarize my last conversation with Sara"

### Multi-Step Commands
- "Find my meeting with John and send him a follow-up email"
- "Schedule a call with Sara and add a note about her portfolio review"
- "Check if I have time next Tuesday for a client meeting"
- "Find emails from last week about estate planning and create a task"


Required API Keys:
Supabase
Go to supabase.com
Create a new project
Go to Settings → API
Copy Project URL → NEXT_PUBLIC_SUPABASE_URL
Copy anon public key → NEXT_PUBLIC_SUPABASE_ANON_KEY
Copy service_role key → SUPABASE_SERVICE_ROLE_KEY
OpenAI
Go to platform.openai.com
Create API key → OPENAI_API_KEY
Google (Gmail & Calendar)
Go to console.cloud.google.com
Create new project
Enable Gmail API and Google Calendar API
Create OAuth 2.0 credentials
Add authorized redirect URI: http://localhost:3000/api/auth/google/callback
Copy Client ID → GOOGLE_CLIENT_ID
Copy Client Secret → GOOGLE_CLIENT_SECRET
HubSpot (Optional)
Go to developers.hubspot.com
Create app
Add redirect URI: http://localhost:3000/api/auth/hubspot/callback
Copy Client ID → HUBSPOT_CLIENT_ID
Copy Client Secret → HUBSPOT_CLIENT_SECRET