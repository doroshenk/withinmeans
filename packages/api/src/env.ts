/** A Lambda environment variable that must be set (CDK sets them). */
export function env(name: string): string {
  const value = process.env[name];
  if (value === undefined || value === '') throw new Error(`Missing environment variable ${name}`);
  return value;
}
