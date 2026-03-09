# Backend (Express + Mongoose)

## Run locally
1. Copy `backend/.env.example` to `backend/.env` and fill values.
2. Start local mongo and backend:

```bash
docker-compose -f ../docker-compose.dev.yml up --build
# OR run mongo locally and `cd backend && npm run dev`
```

## Notes
- Use `MONGODB_NON_SRV` if your network blocks SRV lookups.  
- Add additional routers under `src/routes/v1` and hook controllers/services accordingly.

## Auth

- POST `/api/v1/auth/signup` { name, email, password } → 201 + { user, token }
- POST `/api/v1/auth/signin` { email, password } → 200 + { user, token }

Add `JWT_SECRET` and `JWT_EXPIRES_IN` to your `.env` for production.
