/**
 * @fileoverview
 * Initializes the Firebase Admin SDK using environment variables
 * and exports Firestore and Auth instances for server-side use.
 */

const admin = require("firebase-admin");
const dotenv = require("dotenv");

dotenv.config();

/**
 * Private key used for Firebase Admin authentication.
 * It replaces escaped newline characters to preserve formatting.
 *
 * @constant
 * @type {string | undefined}
 */
const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");

/**
 * Initializes the Firebase Admin application using credential information
 * provided through environment variables.
 *
 * @function
 */
admin.initializeApp({
  credential: admin.credential.cert({
    /** @type {string} */
    projectId: process.env.FIREBASE_PROJECT_ID,

    /** @type {string} */
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,

    /** @type {string | undefined} */
    privateKey,
  }),
});

/**
 * Firestore database instance from the Firebase Admin SDK.
 *
 * @constant
 * @type {FirebaseFirestore.Firestore}
 */
const db = admin.firestore();

/**
 * Authentication service instance from the Firebase Admin SDK.
 *
 * @constant
 * @type {admin.auth.Auth}
 */
const auth = admin.auth();

module.exports = { db, auth };
