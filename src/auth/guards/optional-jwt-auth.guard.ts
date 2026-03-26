import { Injectable, ExecutionContext } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/**
 * Optional JWT Auth Guard
 * - If a valid Bearer token is present, it populates req.user
 * - If no token or an invalid token is present, it allows the request through with req.user = null
 * Use this when an endpoint is public but needs to behave differently for authenticated users (e.g. admins).
 */
@Injectable()
export class OptionalJwtAuthGuard extends AuthGuard('jwt') {
  canActivate(context: ExecutionContext) {
    // Always attempt JWT authentication but never block the request
    return super.canActivate(context);
  }

  // Override handleRequest so that missing/invalid tokens do NOT throw errors
  handleRequest(err: any, user: any) {
    // If auth fails (no token, expired, invalid), just return null — don't throw
    return user || null;
  }
}
