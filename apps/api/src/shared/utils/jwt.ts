import jwt, { SignOptions, VerifyOptions } from "jsonwebtoken";

/** What gets encoded in every staff token. `roles` reflects the multi-role
 *  model (packages/shared INTERNAL_ROLES) - unlike SICOT's single `role`
 *  string. `kind` prevents an applicant token from ever being accepted
 *  where a staff token is expected, or vice versa. */
export interface TokenPayload {
  kind: "staff";
  userId: number;
  employeeCode: string;
  roles: string[];
}

/** Applicant (postulant) tokens are intentionally minimal - no roles, no
 *  OTP concept. Real account creation is M13 (account-request approval);
 *  this is just the login half for an applicant that already exists. */
export interface ApplicantTokenPayload {
  kind: "applicant";
  applicantId: number;
  organisationId: number;
  email: string;
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
  const payload = jwt.verify(token, process.env.JWT_SECRET!, { ...defaults }) as TokenPayload;
  if (payload.kind !== "staff") throw new Error("WRONG_TOKEN_KIND");
  return payload;
}

export function verifyRefreshToken(token: string): TokenPayload {
  const payload = jwt.verify(token, process.env.JWT_REFRESH_SECRET!, { ...defaults }) as TokenPayload;
  if (payload.kind !== "staff") throw new Error("WRONG_TOKEN_KIND");
  return payload;
}

export function signApplicantAccessToken(payload: ApplicantTokenPayload): string {
  return jwt.sign(payload, process.env.JWT_SECRET!, { ...defaults, expiresIn: "30m" });
}

export function signApplicantRefreshToken(payload: ApplicantTokenPayload): string {
  return jwt.sign(payload, process.env.JWT_REFRESH_SECRET!, { ...defaults, expiresIn: "7d" });
}

export function verifyApplicantAccessToken(token: string): ApplicantTokenPayload {
  const payload = jwt.verify(token, process.env.JWT_SECRET!, {
    ...defaults,
  }) as ApplicantTokenPayload;
  if (payload.kind !== "applicant") throw new Error("WRONG_TOKEN_KIND");
  return payload;
}

export function verifyApplicantRefreshToken(token: string): ApplicantTokenPayload {
  const payload = jwt.verify(token, process.env.JWT_REFRESH_SECRET!, {
    ...defaults,
  }) as ApplicantTokenPayload;
  if (payload.kind !== "applicant") throw new Error("WRONG_TOKEN_KIND");
  return payload;
}
