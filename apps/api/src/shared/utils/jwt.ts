import jwt, { SignOptions, VerifyOptions } from "jsonwebtoken";

/** What gets encoded in every token. `roles` reflects the multi-role model
 *  (packages/shared INTERNAL_ROLES) - unlike SICOT's single `role` string. */
export interface TokenPayload {
  userId: number;
  employeeCode: string;
  roles: string[];
}

const defaults: SignOptions & VerifyOptions = {
  audience: "aidn-users",
};

type SignOptionsAndSecret = SignOptions & { secret: string };

const accessTokenSignOptions: SignOptionsAndSecret = {
  expiresIn: "15m",
  secret: process.env.JWT_SECRET!,
};

const refreshTokenSignOptions: SignOptionsAndSecret = {
  expiresIn: "7d",
  secret: process.env.JWT_REFRESH_SECRET!,
};

export function signAccessToken(payload: TokenPayload, options?: SignOptionsAndSecret): string {
  const { secret, ...signOpts } = options || accessTokenSignOptions;
  return jwt.sign(payload, secret, { ...defaults, ...signOpts });
}

export function signRefreshToken(payload: TokenPayload, options?: SignOptionsAndSecret): string {
  const { secret, ...signOpts } = options || refreshTokenSignOptions;
  return jwt.sign(payload, secret, { ...defaults, ...signOpts });
}

export function verifyAccessToken(token: string): TokenPayload {
  return jwt.verify(token, process.env.JWT_SECRET!, { ...defaults }) as TokenPayload;
}

export function verifyRefreshToken(token: string): TokenPayload {
  return jwt.verify(token, process.env.JWT_REFRESH_SECRET!, { ...defaults }) as TokenPayload;
}
