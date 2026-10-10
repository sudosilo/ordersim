ORDERSIM V2 BACKEND SCOPE

Current state

ORDERSIM has no backend today. Every earlier version ran entirely in the browser and stored nothing anywhere. There is no existing database, API, or saved player data to migrate, so the backend starts clean. Version two of the game saves each player's best score per scenario on the phone itself, and it is already wired to talk to a backend the moment one exists.

What the backend does

The backend is a small Node and Express service called ordersim-v2-api that runs on Railway with a Redis database attached. It does four jobs. It accepts a finished run from the game and stores it. It keeps a leaderboard for each scenario with one best score per callsign. It returns the recent run history for a scenario. It keeps running totals across every player, such as total runs, total tickets bumped, and total receipts torn.

How the game connects

Near the top of the script in index.html there is a line that sets API_BASE to an empty value. While it is empty, the game runs offline and only keeps local best scores. Once the backend is live, that value gets set to the Railway domain with the https prefix and no trailing slash. After that, the landing page shows the top callsigns under each scenario card, and every game over sends the run to the backend.

Endpoints

GET /health returns ok true when the service can reach Redis.

POST /api/runs accepts a JSON body with callsign, scenario, score, bumped, receipts, jams, durationSec, and version. It returns ok true and the player's rank on that scenario's leaderboard.

GET /api/leaderboard/SCENARIO returns the top callsigns and scores for that scenario. A limit query value sets how many come back, up to fifty.

GET /api/runs/SCENARIO returns the most recent runs for that scenario, newest first.

GET /api/stats returns the global totals.

Valid scenario names are breakfast, dinner, huge, and freeplay.

Data stored in Redis

ordersim:board:SCENARIO is a sorted set. Each member is a callsign and its score is that callsign's best score on that scenario. A new run only replaces the stored score when it is higher.

ordersim:runs:SCENARIO is a list of run records stored as JSON, newest first, trimmed so it never grows past two hundred entries.

ordersim:stats is a hash holding the running totals for runs, bumped, and receipts.

A stored run record looks like this:

callsign: BLUE
scenario: dinner
score: 18450
durationSec: 212
bumped: 41
receipts: 77
jams: 3
version: v2
at: an ISO timestamp set by the server

Protection

Callsigns are forced to uppercase letters and digits only, twelve characters at most, and default to PLAYER. Every number must be a whole number that is zero or higher. A run shorter than five seconds is rejected. A score higher than four hundred points for every second played is rejected, which blocks obviously faked submissions. Each address can submit at most ten runs per minute. The request body is capped at eight kilobytes. CORS is open by default and can be locked to the Vercel frontend domain through the ALLOWED_ORIGIN variable.

Environment variables

REDIS_URL is required and comes from the Redis service Railway attaches to the project.

ALLOWED_ORIGIN is optional and holds the frontend address with the https prefix, for example the ordersim Vercel domain.

PORT is set by Railway automatically.

Files

index.html is the game frontend, deployed to Vercel from the repo root.

backend/server.js is the backend service, deployed to Railway from the backend folder.

backend/package.json lists the dependencies express, cors, and ioredis, and the start script.

.gitignore keeps node_modules and env files out of the repo, and .vercelignore keeps the backend folder out of the Vercel deploy.

Later phases

A second phase can add daily challenge seeds so every player gets the same order sequence on the same day, which makes leaderboards fair. A third phase can add a lightweight account system so a callsign belongs to one person. A fourth phase can let the backend serve scenario configs and menus, so new scenarios ship without redeploying the frontend.
