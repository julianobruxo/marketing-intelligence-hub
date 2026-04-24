## Local Development

### Daily workflow
1. Docker Desktop must be running (starts automatically with Windows)
2. `npm run dev`

### First time setup
1. Create and start the database:
   ```bash
   docker run -d --name mhub-db \
     -e POSTGRES_USER=postgres \
     -e POSTGRES_PASSWORD=postgres \
     -e POSTGRES_DB=marketing_hub \
     -p 5432:5432 \
     --restart unless-stopped \
     postgres:15
   ```
2. `npm run db:push`
3. `npm run db:seed`
4. `npm run dev`

### DATABASE_URL (fixed forever)
`postgresql://postgres:postgres@localhost:5432/marketing_hub`

Do NOT use `npm run db:migrate` for normal local dev. Use `db push`.
