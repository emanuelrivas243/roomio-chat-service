/**
 * Initializes Firebase Admin SDK using environment variables
 * and exports Firestore and Auth instances for server-side use.
 */

const admin = require("firebase-admin");
const dotenv = require("dotenv");

dotenv.config();

/**
 * Private key used for Firebase Admin authentication.
 */
const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");

admin.initializeApp({
  credential: admin.credential.cert({
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey,
  }),
});

/**
 * Firestore database instance from Firebase Admin SDK.
 */
const db = admin.firestore();

/**
 * Authentication service instance from Firebase Admin SDK.
 */
const auth = admin.auth();

module.exports = { db, auth };
