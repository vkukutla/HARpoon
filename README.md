# HARpoon API

A service for analyzing HAR (HTTP Archive) files and generating curl commands.

## Prerequisites

Before you begin, ensure you have the following installed on your system:

- **Node.js** (v18 or higher recommended)
- **npm** (v9 or higher) - comes with Node.js
- **OpenAI API Key** - required for LLM-powered analysis

(I used nvm 20)

## Setup Instructions

### 1. Configure Environment Variables

Create a `.env` file in the `apps/api` directory:

```bash
touch .env
```

Add the following environment variables to your `.env` file:

```env
# Required: Your OpenAI API key
OPENAI_API_KEY=your_openai_api_key_here

# Optional: OpenAI model to use (defaults to 'gpt-4o-mini')
OPENAI_MODEL=gpt-4o-mini
```

### 2. Running the Application (do this from root)

In one terminal/shell, run:
```bash
npm run dev:api
```
In another, run:
```bash
npm run dev:web
```

Navigate to localhost:3000 in your browser

