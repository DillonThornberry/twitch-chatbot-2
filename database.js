const { MongoClient } = require('mongodb')

require('dotenv').config()

const client = new MongoClient(process.env.DB_URL)

var db = null
var chatColl = null
var userColl = null

const addMessage = async (target, chatRecord) => {
    chatColl.updateOne(
        { twitchName: target },
        { $push: { chatlog: chatRecord } }
    )
}

const addSecretWord = async (secretWord, recipient, giver) => {
    const wordLocation = `secretWords.${secretWord}`
    userColl.updateOne(
        { 'twitchDetails.login': recipient },
        { $set: { [wordLocation]: { user: giver, date: new Date() } } }
    )
}

const connectToDb = async () => {
    if (db) { return }
    await client.connect()
    console.log('db connected')
    db = client.db('chatbot-db')
    chatColl = db.collection('chat')
    userColl = db.collection('users')
}

const loadChat = async (user) => {
    await connectToDb()
    const chatHistory = await chatColl.findOne({ twitchName: user })
    return chatHistory.chatlog
}

const loadUsers = async () => {
    await connectToDb()
    var users = {}
    await userColl.find({}).forEach(user => {
        users[user.twitchDetails.login] = {
            options: user.options, refreshToken: user.refreshToken,
            twitchID: user.twitchID, secretWords: user.secretWords,
            leaderboard: user.leaderboard || []
        }
    })
    return users
}

const setUserRefreshToken = async (user, refreshToken) => {
    if (!refreshToken) {
        return console.log(`no refresh token for ${user} in database.js:55`)
    }
    const finished = new Promise((resolve, reject) => {
        userColl.updateOne({ 'twitchDetails.login': user }, { $set: { refreshToken: refreshToken } })
            .then(() => {
                resolve()
            })
    })
    return await finished
}

const updateSecretWords = async (target, secretWords) => {
    userColl.updateOne(
        { 'twitchDetails.login': target },
        { $set: { secretWords: secretWords } }
    ).then(result => null /* console.log(result) */)
}

const updateLeaderboard = (target, currentLeaderboard) => {
    userColl.updateOne(
        { 'twitchDetails.login': target},
        { $set: { leaderboard: currentLeaderboard } }
    )
}
module.exports = {
    addMessage,
    addSecretWord,
    loadChat,
    loadUsers,
    setUserRefreshToken,
    updateLeaderboard,
    updateSecretWords,
}