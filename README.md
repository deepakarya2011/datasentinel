# DataSentinel AI Frontend

React and Vite frontend for DataSentinel AI.

## Local development

```bash
npm install
npm run dev
```

Set `VITE_API_BASE_URL` to the backend API base URL. For local development, copy `.env.example` to `.env`. For Vercel, set it in Project Settings → Environment Variables, for example:

```text
VITE_API_BASE_URL=https://datasentinelai-backend.onrender.com/api
```

Build with `npm run build`; the output directory is `dist`.
