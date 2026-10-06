/**
 * Every key this application needs, read from the environment in one place.
 *
 * Nothing here is ever sent to a browser. The Connections page asks this
 * module whether a key is *set*, never what it is.
 */

export type ServiceName = "supabase" | "openrouter";

export type ServiceState = {
  name: ServiceName;
  /** Every variable this service needs, and whether each one has a value. */
  vars: { key: string; set: boolean; required: boolean }[];
  ready: boolean;
};

const read = (key: string) => (process.env[key] ?? "").trim();

export const supabaseUrl = () => read("NEXT_PUBLIC_SUPABASE_URL");
export const supabaseServiceKey = () => read("SUPABASE_SERVICE_ROLE_KEY");
export const openRouterKey = () => read("OPENROUTER_API_KEY");
export const appPassword = () => read("APP_PASSWORD");

export const openRouterApp = () => ({
  name: read("OPENROUTER_APP_NAME") || "Shenava Session",
  url: read("OPENROUTER_APP_URL") || "http://localhost:3100",
});

/** What the Connections page renders. Values never leave this module. */
export function serviceStates(): ServiceState[] {
  const state = (name: ServiceName, vars: [string, boolean][]): ServiceState => {
    const rows = vars.map(([key, required]) => ({ key, required, set: read(key).length > 0 }));
    return { name, vars: rows, ready: rows.every((v) => !v.required || v.set) };
  };
  return [
    state("supabase", [
      ["NEXT_PUBLIC_SUPABASE_URL", true],
      ["SUPABASE_SERVICE_ROLE_KEY", true],
      ["NEXT_PUBLIC_SUPABASE_ANON_KEY", false],
    ]),
    state("openrouter", [["OPENROUTER_API_KEY", true]]),
  ];
}

export const configured = () => supabaseUrl().length > 0 && supabaseServiceKey().length > 0;
