export type AuthMode = "iap" | "development";

export type UserSession = {
  email: string;
  name?: string;
  roles: string[];
  mode: AuthMode;
};
