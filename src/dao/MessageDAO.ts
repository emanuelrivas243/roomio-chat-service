const { db } = require("../firebase");

class MessageDAO {
    async createMessage(meetingId: string, payload: any) {
        await db.collection("meetings")
                .doc(meetingId)
                .collection("messages")
                .add(payload);
        return payload;
    }

    async getMessages(meetingId: string) {
        const snap = await db.collection("meetings")
                             .doc(meetingId)
                             .collection("messages")
                             .orderBy('time')
                             .get();
        return snap.docs.map((d: { id: any; data: () => any; }) => ({ id: d.id, ...d.data() }));

    }
}

// CommonJS
module.exports = new MessageDAO();