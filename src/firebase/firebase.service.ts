import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as admin from 'firebase-admin';

interface NotificationPayload {
  token: string;
  notification: {
    title: string;
    body: string;
  };
  data?: Record<string, string>;
}

@Injectable()
export class FirebaseService implements OnModuleInit {
  private readonly logger = new Logger(FirebaseService.name);
  private firebaseApp: admin.app.App;

  constructor(private configService: ConfigService) { }

  onModuleInit() {
    try {
      // Check if Firebase is already initialized
      if (admin.apps.length === 0) {
        const firebaseConfig = this.configService.get<string>('FIREBASE_CONFIG');

        if (firebaseConfig) {
          // Parse the config from environment variable (JSON string or base64)
          let serviceAccount;

          try {
            // Try parsing as JSON
            serviceAccount = JSON.parse(firebaseConfig);
          } catch {
            // Try decoding from base64
            const decoded = Buffer.from(firebaseConfig, 'base64').toString('utf-8');
            serviceAccount = JSON.parse(decoded);
          }

          this.firebaseApp = admin.initializeApp({
            credential: admin.credential.cert(serviceAccount),
          });

          this.logger.log('✅ Firebase Admin SDK initialized successfully');
        } else {
          this.logger.warn(
            '⚠️ FIREBASE_CONFIG not found in environment variables. Push notifications will not work.',
          );
        }
      } else {
        this.firebaseApp = admin.apps[0];
        this.logger.log('✅ Firebase Admin SDK already initialized');
      }
    } catch (error) {
      this.logger.error(`❌ Failed to initialize Firebase Admin SDK: ${error.message}`);
    }
  }

  /**
   * Send push notification via Firebase Cloud Messaging
   */
  async sendNotification(payload: NotificationPayload): Promise<boolean> {
    try {
      if (!this.firebaseApp) {
        this.logger.warn('Firebase not initialized. Skipping push notification.');
        return false;
      }

      const message: admin.messaging.Message = {
        notification: {
          title: payload.notification.title,
          body: payload.notification.body,
        },
        data: payload.data || {},
        token: payload.token,
        android: {
          notification: {
            sound: 'default',
            priority: 'high',
          },
        },
        apns: {
          payload: {
            aps: {
              sound: 'default',
              badge: 1,
            },
          },
        },
      };

      const response = await admin.messaging().send(message);
      this.logger.log(`✅ FCM notification sent successfully: ${response}`);
      return true;
    } catch (error) {
      this.logger.error(`❌ Failed to send FCM notification: ${error.message}`);

      // Check for invalid token errors
      if (error.code === 'messaging/invalid-registration-token' ||
        error.code === 'messaging/registration-token-not-registered') {
        this.logger.warn(`Invalid or expired FCM token: ${payload.token.substring(0, 20)}...`);
      }

      return false;
    }
  }

  /**
   * Send notifications to multiple tokens
   */
  async sendMulticast(
    tokens: string[],
    notification: { title: string; body: string },
    data?: Record<string, string>,
  ): Promise<{ successCount: number; failureCount: number }> {
    try {
      if (!this.firebaseApp || tokens.length === 0) {
        return { successCount: 0, failureCount: 0 };
      }

      const message: admin.messaging.MulticastMessage = {
        notification,
        data: data || {},
        tokens,
        android: {
          notification: {
            sound: 'default',
            priority: 'high',
          },
        },
        apns: {
          payload: {
            aps: {
              sound: 'default',
              badge: 1,
            },
          },
        },
      };

      const response = await admin.messaging().sendEachForMulticast(message);

      this.logger.log(
        `📤 Multicast sent: ${response.successCount} successful, ${response.failureCount} failed`,
      );

      return {
        successCount: response.successCount,
        failureCount: response.failureCount,
      };
    } catch (error) {
      this.logger.error(`❌ Failed to send multicast notification: ${error.message}`);
      return { successCount: 0, failureCount: tokens.length };
    }
  }
}

