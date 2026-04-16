Prerequisites
- Node.js 22.x
- `npx` available
- Prisma local dev available via `npx prisma`

Boot sequence (Automatic)
The recommended way to start the local development server is using the automated bootloader:
1. Run `npm start` from the root of the web app (`apps/web`). This script will automatically start Prisma Dev, align your `.env` ports correctly, and subsequently boot the Next.js frontend (`npm run dev`).

Boot sequence (Manual fallback)
The old manual boot sequence still works but requires manually updating ports in `.env`:
1. `npx prisma dev --name marketing-hub --detach`
2. `npx prisma dev ls` to find the proxy port and direct database port.
3. Update `DATABASE_URL` and `DIRECT_DATABASE_URL` in `.env` based on the output.
4. `npx prisma db push`
5. `npm run db:seed`
6. `npm run dev`

Verify it is working
- `npx prisma dev ls` shows `marketing-hub` as running
- The app loads at `http://localhost:3000`

Stop / restart local DB
- Stop: `npx prisma dev stop marketing-hub`
- Restart: `npx prisma dev --name marketing-hub --detach`

Do NOT use `npm run db:migrate` for local dev — use `db push`
