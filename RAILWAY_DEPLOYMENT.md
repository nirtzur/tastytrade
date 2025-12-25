# Railway Deployment Guide

## Prerequisites
1. A Railway account
2. GitHub repository connected to Railway

## Environment Variables
Set the following variables in your Railway project settings:

- `NODE_ENV`: `production`
- `TASTYTRADE_BASE_URL`: `https://api.tastytrade.com`
- `TASTYTRADE_ACCOUNT_NUMBER`: Your account number
- `FRONTEND_URL`: The URL of your deployed frontend (e.g., `https://your-app.up.railway.app`)

### Database
If you add a MySQL plugin in Railway, `DATABASE_URL` will be set automatically.
If using an external database, set:
- `DB_HOST`
- `DB_NAME`
- `DB_USERNAME`
- `DB_PASSWORD`

## Build & Deploy
Railway will automatically detect the `Procfile` and `package.json`.
The build command `npm run railway:build` will be executed, which builds the frontend.
The start command `npm start` will run the server.
