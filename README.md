# NexusRandom

An anonymous, real-time video and text chat platform with interest-based matchmaking, designed for speed, security, and a premium cyberpunk aesthetic.

---

## Key Features

- **Live Video & Audio**: Low-latency peer-to-peer connection utilizing WebRTC.
- **Anonymous Text Chat**: Real-time messaging using Socket.io with typing indicators and online count.
- **Interest Matching**: Algorithmic pairing based on optional user-submitted keyword tags.
- **Security Hardening**:
  - Secure **JWT Access/Refresh Tokens** in HTTP-only, secure, SameSite cookies.
  - Automatic sliding-session renewals in middleware.
  - Optional **2FA (TOTP)** console authentication.
  - Password hashing with **Bcrypt**.
  - XSS protection via input sanitization and customized **CSP Helmet headers**.
  - Globally restricted HTTP methods, rate limits, and payload size thresholds.
- **Cyberpunk UI & Responsiveness**: Fully responsive, mobile-first layouts featuring neon glassmorphism and custom animation effects.
- **Core Web Vitals Optimized**: Dynamic route code-splitting with React lazy-loading.

---

## Tech Stack

- **Frontend**: React.js, Vite, Tailwind CSS, TanStack Query, Wouter
- **Backend**: Node.js, Express, Socket.io, Pino Logging, Express Rate Limit, Helmet
- **Database**: PostgreSQL (via RDS) with Drizzle ORM

---

## Local Development Setup

### Prerequisites
- Node.js (LTS version)
- pnpm package manager (`npm install -g pnpm`)

### 1. Install Workspace Dependencies
Clone the repository and install all monorepo dependencies:
```bash
git clone https://github.com/AnuragKannojiya/nexusrandom.git
cd nexusrandom
pnpm install
```

### 2. Configure Environment Variables
Create an environment file at `artifacts/api-server/.env`:
```ini
PORT=8080
NODE_ENV=development
DATABASE_URL=postgresql://<username>:<password>@<host>:<port>/<database>
ADMIN_SECRET=your_admin_secret_or_bcrypt_hash
SESSION_SECRET=a_long_secure_random_string_for_jwt_signing
ALLOWED_ORIGIN=http://localhost:5000,http://localhost:5001,http://localhost:5002

# Optional: Add 2FA support by setting a base32 secret
# ADMIN_2FA_SECRET=MZXW6YTBOI======
```

### 3. Run the Development Servers
Open two terminal sessions to run both servers concurrently:

- **Terminal 1 (Backend API Server)**:
  ```bash
  pnpm --filter @workspace/api-server run dev
  ```

- **Terminal 2 (Frontend Client)**:
  ```bash
  PORT=5000 BASE_PATH=/nexus-random/ pnpm --filter @workspace/nexus-random run dev
  ```

Access the frontend in your browser at `http://localhost:5000/nexus-random/`.

---

## Production Build & Deployment

To compile and optimize all packages for production:
```bash
PORT=5000 BASE_PATH=/nexus-random/ pnpm run build
```

The compiled frontend assets will be written to `artifacts/nexus-random/dist/public` and the backend will compile into single-module bundles at `artifacts/api-server/dist`.
