# TastyTrade Dashboard

## Overview
A web application for tracking TastyTrade account history, positions, and analysis.

## Tech Stack
- **Backend**: Node.js, Express, Sequelize
- **Frontend**: React (Create React App)
- **Database**: SQL Database (managed via Sequelize)

## Project Structure
- `/models/`: Sequelize database models and schemas.
- `/frontend/src/components/`: React UI components.
- `/Analyze/`: Utility scripts for processing data (ETFs, SP500, etc.).
- `/migrations/`: Database migrations.

## Coding Guidelines
- **Frontend**: Use functional React components with Hooks. Prefer standard CSS (Vanilla CSS).
- **Backend**: Use Sequelize for all database interactions. Do not use raw SQL unless absolutely necessary.
- **General**: Do not suppress linter warnings. Add tests for new features.

## Key Workflows
- **Frontend**: Navigate to `/frontend` and run `npm start` or `npm run build`.
- **Backend**: Run `node server.js` or `npm start` in the root directory.