export type AppEnv = {
  Bindings: Env;
  Variables: {
    /** Sesión resuelta por el middleware, si la hay. */
    session: SessionClaims | null;
  };
};

export interface SessionClaims {
  sub: string;
  authTime: number;
  expiresAt: number;
}
