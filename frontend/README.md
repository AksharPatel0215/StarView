# StarView frontend

React and TypeScript workspace UI built with Vite. See the [project README](../README.md) for backend setup, local models, security, and connected accounts.

```sh
npm ci
npm run dev
npm test
npm run lint
npm run build
```

The development server binds to `127.0.0.1:5173` and proxies `/api` to `127.0.0.1:8000`. Models, credentials, and note files are managed by the backend; do not put secrets in `VITE_` variables.
