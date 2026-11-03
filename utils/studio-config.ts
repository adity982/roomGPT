export function studioPublicOrigin() {
  const configured = process.env.STUDIO_PUBLIC_URL;
  if (configured) return new URL(configured).origin;
  const vercelHost = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  return vercelHost ? `https://${vercelHost}` : undefined;
}
