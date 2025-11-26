const { db } = require("../firebase");

/**
 * Data Access Object for managing chat messages stored in Firestore.
 * Provides methods to create and retrieve messages for a specific meeting.
 *
 * @class MessageDAO
 */
class MessageDAO {
    /**
     * Stores a new message in the Firestore "meetings/{meetingId}/messages" subcollection.
     *
     * @async
     * @function createMessage
     * @param {string} meetingId - ID of the meeting where the message belongs.
     * @param {Object} payload - Message data to be stored.
     * @returns {Promise<Object>} The same payload that was stored.
     */
    async createMessage(meetingId, payload) {
        await db.collection("meetings")
                .doc(meetingId)
                .collection("messages")
                .add(payload);

        return payload;
    }

    /**
     * Retrieves all messages for a given meeting, ordered by timestamp.
     *
     * @async
     * @function getMessages
     * @param {string} meetingId - ID of the meeting whose messages will be retrieved.
     * @returns {Promise<Array<{id: string, [key: string]: any}>>}
     * An array of message objects with Firestore document IDs included.
     */
    async getMessages(meetingId) {
        const snap = await db.collection("meetings")
                             .doc(meetingId)
                             .collection("messages")
                             .orderBy("time")
                             .get();

        return snap.docs.map((doc) => ({
            id: doc.id,
            ...doc.data()
        }));
    }
}

module.exports = new MessageDAO();
