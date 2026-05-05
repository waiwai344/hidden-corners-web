export type CurrentUser = {
  userId: number;
  username: string;
};

declare module "express-session" {
  interface SessionData {
    user?: CurrentUser;
  }
}
