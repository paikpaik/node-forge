export interface AuthedRequest<TUser = unknown> {
  headers: { authorization?: string; [key: string]: unknown };
  user?: TUser;
}
