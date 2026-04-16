Prerequisites
- Node.js 22.x
- `npx` available
- Prisma local dev available via `npx prisma`

Boot sequence
1. `npx prisma dev --name marketing-hub --detach`
2. `npx prisma db push`
3. `npm run db:seed`
4. `npm run dev`

Verify it is working
- `npx prisma dev ls` shows `marketing-hub` as running
- The app loads at `http://localhost:3000`

Stop / restart local DB
- Stop: `npx prisma dev stop marketing-hub`
- Restart: `npx prisma dev --name marketing-hub --detach`

Do NOT use `npm run db:migrate` for local dev — use `db push`
