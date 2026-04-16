export type AuthMode = "iap" | "cookie" | "development";

export type UserSession = {
  email: string;
  name?: string;
  roles: string[];
  mode: AuthMode;
};
