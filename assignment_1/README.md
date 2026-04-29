# Scaler Persona Chatbot

Persona-based AI chatbot for Assignment 01. The project is split for deployment:

- `frontend/`: React + Vite app for Vercel
- `backend/`: Python FastAPI API for Render

The frontend never sees the Gemini key. It calls the backend, and the backend calls Gemini with a persona-specific system prompt.

## Features

- Three researched personas: Anshuman Singh, Abhimanyu Saxena, and Kshitij Mishra
- Persona switcher with conversation reset
- Suggestion chips for each persona
- Typing indicator while Gemini responds
- Friendly API and configuration error messages
- Mobile-responsive React UI
- Backend CORS configured through environment variables
- `.env.example` files for both frontend and backend

## Structure

```text
assignment_1/
  backend/
    app/
      main.py
      personas.py
    .env.example
    requirements.txt
    runtime.txt
    render.yaml
    Procfile
  frontend/
    src/
      main.jsx
      styles.css
    .env.example
    package.json
    vercel.json
  prompts.md
  reflection.md
  README.md
```

## Backend Setup

```bash
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
copy .env.example .env
```

Edit `backend/.env`:

```env
GEMINI_API_KEY=your_real_gemini_key
GEMINI_MODEL=gemini-2.5-flash
FRONTEND_ORIGIN=http://localhost:5173,https://your-vercel-app.vercel.app
```

Run locally:

```bash
uvicorn app.main:app --reload
```

Backend URL: `http://127.0.0.1:8000`

## Frontend Setup

```bash
cd frontend
npm install
copy .env.example .env
```

Edit `frontend/.env`:

```env
VITE_API_BASE_URL=http://127.0.0.1:8000
```

Run locally:

```bash
npm run dev
```

Frontend URL: `http://localhost:5173`

## Render Deployment

Create a Render Web Service.

- Root directory: `backend`
- Build command: `pip install -r requirements.txt`
- Start command: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
- Runtime: pinned in `backend/runtime.txt` as Python 3.12.8

Environment variables:

```env
GEMINI_API_KEY=your_real_gemini_key
GEMINI_MODEL=gemini-2.5-flash
FRONTEND_ORIGIN=https://your-vercel-app.vercel.app
```

After Render deploys, copy the backend URL.

## Vercel Deployment

Create a Vercel project.

- Root directory: `frontend`
- Framework preset: Vite
- Build command: `npm run build`
- Output directory: `dist`

Environment variable:

```env
VITE_API_BASE_URL=https://your-render-backend.onrender.com
```

After Vercel deploys, copy the Vercel URL and put it into Render's `FRONTEND_ORIGIN`.

## Deployment URLs

- Frontend: `TODO: paste Vercel URL`
- Backend: `TODO: paste Render URL`

## Screenshots

Add screenshots after deployment.

- Desktop: `TODO`
- Mobile: `TODO`

## Research Notes

The prompts use public information from:

- [Scaler About](https://www.scaler.com/about/)
- [InterviewBit Scaler Academy review](https://www.interviewbit.com/scaler-academy-review)
- [TechGraph interview with Abhimanyu Saxena](https://techgraph.co/interviews/abhimanyu-saxena-scaler-academy-ed-tech-sector-has-been-a-silver-lining/)
- [Scaler School of Technology](https://www.scaler.com/school-of-technology/)
- Public LinkedIn/search snippets for Anshuman Singh and Kshitij Mishra
- [Gemini API system instruction docs](https://ai.google.dev/gemini-api/docs/system-instructions)

## Notes

Do not commit real `.env` files. Keep the Gemini API key only in `backend/.env` locally and in Render environment variables.
