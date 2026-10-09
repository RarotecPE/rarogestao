export const getRaroGestaoBaseUrl = () => {
  const explicitBaseUrl = process.env.RAROGESTAO_BASE_URL?.trim();

  if (explicitBaseUrl) {
    return explicitBaseUrl.replace(/\/+$/, "");
  }

  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`.replace(/\/+$/, "");
  }

  return "http://localhost:3000";
};

export const buildRaroGestaoUrl = (path: string) => {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${getRaroGestaoBaseUrl()}${normalizedPath}`;
};
