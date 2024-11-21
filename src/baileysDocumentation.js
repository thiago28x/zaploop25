/* Note: When a message is received/sent, due to signal sessions needing updating, the auth keys (authState.keys) will update. Whenever that happens, you must save the updated keys (authState.keys.set() is called). Not doing so will prevent your messages from reaching the recipient & cause other unexpected consequences. The useMultiFileAuthState function automatically takes care of that, but for any other serious implementation -- you will need to be very careful with the key state management.

Listening to Connection Updates
Baileys now fires the connection.update event to let you know something has updated in the connection. This data has the following structure:

type ConnectionState = {
    /** connection is now open, connecting or closed */
    connection: WAConnectionState
    /** the error that caused the connection to close */
    lastDisconnect?: {
        error: Error
        date: Date
    }
    /** is this a new login */
    isNewLogin?: boolean
    /** the current QR code */
    qr?: string
    /** has the device received all pending notifications while it was offline */
    receivedPendingNotifications?: boolean 
}
Copy
Note: this also offers any updates to the QR

Handling Events
Baileys uses the EventEmitter syntax for events. They're all nicely typed up, so you shouldn't have any issues with an Intellisense editor like VS Code.

The events are typed as mentioned here:


export type BaileysEventMap = {
    /** connection state has been updated -- WS closed, opened, connecting etc. */
    'connection.update': Partial<ConnectionState>
    /** credentials updated -- some metadata, keys or something */
    'creds.update': Partial<AuthenticationCreds>
    /** history sync, everything is reverse chronologically sorted */
    'messaging-history.set': {
        chats: Chat[]
        contacts: Contact[]
        messages: WAMessage[]
        isLatest: boolean
    }
    /** upsert chats */
    'chats.upsert': Chat[]
    /** update the given chats */
    'chats.update': Partial<Chat>[]
    /** delete chats with given ID */
    'chats.delete': string[]
    'labels.association': LabelAssociation
    'labels.edit': Label
    /** presence of contact in a chat updated */
    'presence.update': { id: string, presences: { [participant: string]: PresenceData } }

    'contacts.upsert': Contact[]
    'contacts.update': Partial<Contact>[]

    'messages.delete': { keys: WAMessageKey[] } | { jid: string, all: true }
    'messages.update': WAMessageUpdate[]
    'messages.media-update': { key: WAMessageKey, media?: { ciphertext: Uint8Array, iv: Uint8Array }, error?: Boom }[]
    /**
     * add/update the given messages. If they were received while the connection was online,
     * the update will have type: "notify"
     *  */
    'messages.upsert': { messages: WAMessage[], type: MessageUpsertType }
    /** message was reacted to. If reaction was removed -- then "reaction.text" will be falsey */
    'messages.reaction': { key: WAMessageKey, reaction: proto.IReaction }[]

    'message-receipt.update': MessageUserReceiptUpdate[]

    'groups.upsert': GroupMetadata[]
    'groups.update': Partial<GroupMetadata>[]
    /** apply an action to participants in a group */
    'group-participants.update': { id: string, participants: string[], action: ParticipantAction }

    'blocklist.set': { blocklist: string[] }
    'blocklist.update': { blocklist: string[], type: 'add' | 'remove' }
    /** Receive an update on a call, including when the call was received, rejected, accepted */
    'call': WACallEvent[]
}
Copy
You can listen to these events like this:


const sock = makeWASocket()
sock.ev.on('messages.upsert', ({ messages }) => {
    console.log('got messages', messages)
})

Copy
Implementing a Data Store
Baileys does not come with a defacto storage for chats, contacts, or messages. However, a simple in-memory implementation has been provided. The store listens for chat updates, new messages, message updates, etc., to always have an up-to-date version of the data.

It can be used as follows:

import makeWASocket, { makeInMemoryStore } from '@whiskeysockets/baileys'
// the store maintains the data of the WA connection in memory
// can be written out to a file & read from it
const store = makeInMemoryStore({ })
// can be read from a file
store.readFromFile('./baileys_store.json')
// saves the state to a file every 10s
setInterval(() => {
    store.writeToFile('./baileys_store.json')
}, 10_000)

const sock = makeWASocket({ })
// will listen from this socket
// the store can listen from a new socket once the current socket outlives its lifetime
store.bind(sock.ev)

sock.ev.on('chats.upsert', () => {
    // can use "store.chats" however you want, even after the socket dies out
    // "chats" => a KeyedDB instance
    console.log('got chats', store.chats.all())
})

sock.ev.on('contacts.upsert', () => {
    console.log('got contacts', Object.values(store.contacts))
})

Copy
The store also provides some simple functions such as loadMessages that utilize the store to speed up data retrieval.

Note: I highly recommend building your own data store especially for MD connections, as storing someone's entire chat history in memory is a terrible waste of RAM. */